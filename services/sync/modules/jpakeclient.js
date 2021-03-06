/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Firefox Sync.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * Philipp von Weitershausen <philipp@weitershausen.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://services-sync/log4moz.js");
Cu.import("resource://services-sync/rest.js");
Cu.import("resource://services-sync/constants.js");
Cu.import("resource://services-sync/util.js");

const EXPORTED_SYMBOLS = ["JPAKEClient"];

const REQUEST_TIMEOUT         = 60; // 1 minute
const JPAKE_SIGNERID_SENDER   = "sender";
const JPAKE_SIGNERID_RECEIVER = "receiver";
const JPAKE_LENGTH_SECRET     = 8;
const JPAKE_LENGTH_CLIENTID   = 256;
const JPAKE_VERIFY_VALUE      = "0123456789ABCDEF";


/*
 * Client to exchange encrypted data using the J-PAKE algorithm.
 * The exchange between two clients of this type looks like this:
 * 
 * 
 * Client A                      Server                      Client B
 * ==================================================================
 *                                  |
 * retrieve channel <---------------|
 * generate random secret           |
 * show PIN = secret + channel      |                ask user for PIN
 * upload A's message 1 ----------->|
 *                                  |--------> retrieve A's message 1
 *                                  |<---------- upload B's message 1
 * retrieve B's message 1 <---------|
 * upload A's message 2 ----------->|
 *                                  |--------> retrieve A's message 2
 *                                  |                     compute key
 *                                  |<---------- upload B's message 2
 * retrieve B's message 2 <---------|
 * compute key                      |
 * upload sha256d(key) ------------>|
 *                                  |---------> retrieve sha256d(key)
 *                                  |          verify against own key
 *                                  |                    encrypt data
 *                                  |<------------------- upload data
 * retrieve data <------------------|
 * verify HMAC                      |
 * decrypt data                     |
 * 
 * 
 * Create a client object like so:
 * 
 *   let client = new JPAKEClient(observer);
 * 
 * The 'observer' object must implement the following methods:
 * 
 *   displayPIN(pin) -- Display the PIN to the user, only called on the client
 *     that didn't provide the PIN.
 * 
 *   onComplete(data) -- Called after transfer has been completed. On
 *     the sending side this is called with no parameter and as soon as the
 *     data has been uploaded, which this doesn't mean the receiving side
 *     has actually retrieved them yet.
 *
 *   onAbort(error) -- Called whenever an error is encountered. All errors lead
 *     to an abort and the process has to be started again on both sides.
 * 
 * To start the data transfer on the receiving side, call
 * 
 *   client.receiveNoPIN();
 * 
 * This will allocate a new channel on the server, generate a PIN, have it
 * displayed and then do the transfer once the protocol has been completed
 * with the sending side.
 * 
 * To initiate the transfer from the sending side, call
 * 
 *   client.sendWithPIN(pin, data)
 * 
 * To abort the process, call
 * 
 *   client.abort();
 * 
 * Note that after completion or abort, the 'client' instance may not be reused.
 * You will have to create a new one in case you'd like to restart the process.
 */
function JPAKEClient(observer) {
  this.observer = observer;

  this._log = Log4Moz.repository.getLogger("Sync.JPAKEClient");
  this._log.level = Log4Moz.Level[Svc.Prefs.get(
    "log.logger.service.jpakeclient", "Debug")];

  this._serverUrl = Svc.Prefs.get("jpake.serverURL");
  this._pollInterval = Svc.Prefs.get("jpake.pollInterval");
  this._maxTries = Svc.Prefs.get("jpake.maxTries");
  if (this._serverUrl.slice(-1) != "/")
    this._serverUrl += "/";

  this._jpake = Cc["@mozilla.org/services-crypto/sync-jpake;1"]
                  .createInstance(Ci.nsISyncJPAKE);

  this._setClientID();
}
JPAKEClient.prototype = {

  _chain: Async.chain,

  /*
   * Public API
   */

  receiveNoPIN: function receiveNoPIN() {
    this._my_signerid = JPAKE_SIGNERID_RECEIVER;
    this._their_signerid = JPAKE_SIGNERID_SENDER;

    this._secret = this._createSecret();

    // Allow a large number of tries first while we wait for the PIN
    // to be entered on the other device.
    this._maxTries = Svc.Prefs.get("jpake.firstMsgMaxTries");
    this._chain(this._getChannel,
                this._computeStepOne,
                this._putStep,
                this._getStep,
                function(callback) {
                  // Now we can switch back to the smaller timeout.
                  this._maxTries = Svc.Prefs.get("jpake.maxTries");
                  callback();
                },
                this._computeStepTwo,
                this._putStep,
                this._getStep,
                this._computeFinal,
                this._computeKeyVerification,
                this._putStep,
                this._getStep,
                this._decryptData,
                this._complete)();
  },

  sendWithPIN: function sendWithPIN(pin, obj) {
    this._my_signerid = JPAKE_SIGNERID_SENDER;
    this._their_signerid = JPAKE_SIGNERID_RECEIVER;

    this._channel = pin.slice(JPAKE_LENGTH_SECRET);
    this._channelUrl = this._serverUrl + this._channel;
    this._secret = pin.slice(0, JPAKE_LENGTH_SECRET);
    this._data = JSON.stringify(obj);

    this._chain(this._computeStepOne,
                this._getStep,
                this._putStep,
                this._computeStepTwo,
                this._getStep,
                this._putStep,
                this._computeFinal,
                this._getStep,
                this._encryptData,
                this._putStep,
                this._complete)();
  },

  abort: function abort(error) {
    this._log.debug("Aborting...");
    this._finished = true;
    let self = this;

    // Default to "user aborted".
    if (!error)
      error = JPAKE_ERROR_USERABORT;

    if (error == JPAKE_ERROR_CHANNEL
        || error == JPAKE_ERROR_NETWORK
        || error == JPAKE_ERROR_NODATA) {
      Utils.namedTimer(function() { this.observer.onAbort(error); }, 0,
                       this, "_timer_onAbort");
    } else {
      this._reportFailure(error, function() { self.observer.onAbort(error); });
    }
  },

  /*
   * Utilities
   */

  _setClientID: function _setClientID() {
    let rng = Cc["@mozilla.org/security/random-generator;1"]
                .createInstance(Ci.nsIRandomGenerator);
    let bytes = rng.generateRandomBytes(JPAKE_LENGTH_CLIENTID / 2);
    this._clientID = [("0" + byte.toString(16)).slice(-2)
                      for each (byte in bytes)].join("");
  },

  _createSecret: function _createSecret() {
    // 0-9a-z without 1,l,o,0
    const key = "23456789abcdefghijkmnpqrstuvwxyz";
    let rng = Cc["@mozilla.org/security/random-generator;1"]
                .createInstance(Ci.nsIRandomGenerator);
    let bytes = rng.generateRandomBytes(JPAKE_LENGTH_SECRET);
    return [key[Math.floor(byte * key.length / 256)]
            for each (byte in bytes)].join("");
  },

  _newRequest: function _newRequest(uri) {
    let request = new RESTRequest(uri);
    request.setHeader("X-KeyExchange-Id", this._clientID);
    request.timeout = REQUEST_TIMEOUT;
    return request;
  },

  /*
   * Steps of J-PAKE procedure
   */

  _getChannel: function _getChannel(callback) {
    this._log.trace("Requesting channel.");
    let request = this._newRequest(this._serverUrl + "new_channel");
    request.get(Utils.bind2(this, function handleChannel(error) {
      if (this._finished)
        return;

      if (error) {
        this._log.error("Error acquiring channel ID. " + error);
        this.abort(JPAKE_ERROR_CHANNEL);
        return;
      }
      if (request.response.status != 200) {
        this._log.error("Error acquiring channel ID. Server responded with HTTP "
                        + request.response.status);
        this.abort(JPAKE_ERROR_CHANNEL);
        return;
      }

      try {
        this._channel = JSON.parse(request.response.body);
      } catch (ex) {
        this._log.error("Server responded with invalid JSON.");
        this.abort(JPAKE_ERROR_CHANNEL);
        return;
      }
      this._log.debug("Using channel " + this._channel);
      this._channelUrl = this._serverUrl + this._channel;

      // Don't block on UI code.
      let pin = this._secret + this._channel;
      Utils.namedTimer(function() { this.observer.displayPIN(pin); }, 0,
                       this, "_timer_displayPIN");
      callback();
    }));
  },

  // Generic handler for uploading data.
  _putStep: function _putStep(callback) {
    this._log.trace("Uploading message " + this._outgoing.type);
    let request = this._newRequest(this._channelUrl);
    request.put(this._outgoing, Utils.bind2(this, function (error) {
      if (this._finished)
        return;

      if (error) {
        this._log.error("Error uploading data. " + error);
        this.abort(JPAKE_ERROR_NETWORK);
        return;
      }
      if (request.response.status != 200) {
        this._log.error("Could not upload data. Server responded with HTTP "
                        + request.response.status);
        this.abort(JPAKE_ERROR_SERVER);
        return;
      }
      // There's no point in returning early here since the next step will
      // always be a GET so let's pause for twice the poll interval.
      this._etag = request.response.headers["etag"];
      Utils.namedTimer(function () { callback(); }, this._pollInterval * 2,
                       this, "_pollTimer");
    }));
  },

  // Generic handler for polling for and retrieving data.
  _pollTries: 0,
  _getStep: function _getStep(callback) {
    this._log.trace("Retrieving next message.");
    let request = this._newRequest(this._channelUrl);
    if (this._etag) {
      request.setHeader("If-None-Match", this._etag);
    }

    request.get(Utils.bind2(this, function (error) {
      if (this._finished)
        return;

      if (error) {
        this._log.error("Error fetching data. " + error);
        this.abort(JPAKE_ERROR_NETWORK);
        return;
      }

      if (request.response.status == 304) {
        this._log.trace("Channel hasn't been updated yet. Will try again later.");
        if (this._pollTries >= this._maxTries) {
          this._log.error("Tried for " + this._pollTries + " times, aborting.");
          this.abort(JPAKE_ERROR_TIMEOUT);
          return;
        }
        this._pollTries += 1;
        Utils.namedTimer(function() { this._getStep(callback); },
                         this._pollInterval, this, "_pollTimer");
        return;
      }
      this._pollTries = 0;

      if (request.response.status == 404) {
        this._log.error("No data found in the channel.");
        this.abort(JPAKE_ERROR_NODATA);
        return;
      }
      if (request.response.status != 200) {
        this._log.error("Could not retrieve data. Server responded with HTTP "
                        + request.response.status);
        this.abort(JPAKE_ERROR_SERVER);
        return;
      }

      try {
        this._incoming = JSON.parse(request.response.body);
      } catch (ex) {
        this._log.error("Server responded with invalid JSON.");
        this.abort(JPAKE_ERROR_INVALID);
        return;
      }
      this._log.trace("Fetched message " + this._incoming.type);
      callback();
    }));
  },

  _reportFailure: function _reportFailure(reason, callback) {
    this._log.debug("Reporting failure to server.");
    let request = this._newRequest(this._serverUrl + "report");
    request.setHeader("X-KeyExchange-Cid", this._channel);
    request.setHeader("X-KeyExchange-Log", reason);
    request.post("", Utils.bind2(this, function (error) {
      if (error) {
        this._log.warn("Report failed: " + error);
      } else if (request.response.status != 200) {
        this._log.warn("Report failed. Server responded with HTTP "
                       + request.response.status);
      }

      // Do not block on errors, we're done or aborted by now anyway.
      callback();
    }));
  },

  _computeStepOne: function _computeStepOne(callback) {
    this._log.trace("Computing round 1.");
    let gx1 = {};
    let gv1 = {};
    let r1 = {};
    let gx2 = {};
    let gv2 = {};
    let r2 = {};
    try {
      this._jpake.round1(this._my_signerid, gx1, gv1, r1, gx2, gv2, r2);
    } catch (ex) {
      this._log.error("JPAKE round 1 threw: " + ex);
      this.abort(JPAKE_ERROR_INTERNAL);
      return;
    }
    let one = {gx1: gx1.value,
               gx2: gx2.value,
               zkp_x1: {gr: gv1.value, b: r1.value, id: this._my_signerid},
               zkp_x2: {gr: gv2.value, b: r2.value, id: this._my_signerid}};
    this._outgoing = {type: this._my_signerid + "1", payload: one};
    this._log.trace("Generated message " + this._outgoing.type);
    callback();
  },

  _computeStepTwo: function _computeStepTwo(callback) {
    this._log.trace("Computing round 2.");
    if (this._incoming.type != this._their_signerid + "1") {
      this._log.error("Invalid round 1 message: "
                      + JSON.stringify(this._incoming));
      this.abort(JPAKE_ERROR_WRONGMESSAGE);
      return;
    }

    let step1 = this._incoming.payload;
    if (!step1 || !step1.zkp_x1 || step1.zkp_x1.id != this._their_signerid
        || !step1.zkp_x2 || step1.zkp_x2.id != this._their_signerid) {
      this._log.error("Invalid round 1 payload: " + JSON.stringify(step1));
      this.abort(JPAKE_ERROR_WRONGMESSAGE);
      return;
    }

    let A = {};
    let gvA = {};
    let rA = {};

    try {
      this._jpake.round2(this._their_signerid, this._secret,
                         step1.gx1, step1.zkp_x1.gr, step1.zkp_x1.b,
                         step1.gx2, step1.zkp_x2.gr, step1.zkp_x2.b,
                         A, gvA, rA);
    } catch (ex) {
      this._log.error("JPAKE round 2 threw: " + ex);
      this.abort(JPAKE_ERROR_INTERNAL);
      return;
    }
    let two = {A: A.value,
               zkp_A: {gr: gvA.value, b: rA.value, id: this._my_signerid}};
    this._outgoing = {type: this._my_signerid + "2", payload: two};
    this._log.trace("Generated message " + this._outgoing.type);
    callback();
  },

  _computeFinal: function _computeFinal(callback) {
    if (this._incoming.type != this._their_signerid + "2") {
      this._log.error("Invalid round 2 message: "
                      + JSON.stringify(this._incoming));
      this.abort(JPAKE_ERROR_WRONGMESSAGE);
      return;
    }

    let step2 = this._incoming.payload;
    if (!step2 || !step2.zkp_A || step2.zkp_A.id != this._their_signerid) {
      this._log.error("Invalid round 2 payload: " + JSON.stringify(step1));
      this.abort(JPAKE_ERROR_WRONGMESSAGE);
      return;
    }

    let aes256Key = {};
    let hmac256Key = {};

    try {
      this._jpake.final(step2.A, step2.zkp_A.gr, step2.zkp_A.b, HMAC_INPUT,
                        aes256Key, hmac256Key);
    } catch (ex) {
      this._log.error("JPAKE final round threw: " + ex);
      this.abort(JPAKE_ERROR_INTERNAL);
      return;
    }

    this._crypto_key = aes256Key.value;
    let hmac_key = Utils.makeHMACKey(Utils.safeAtoB(hmac256Key.value));
    this._hmac_hasher = Utils.makeHMACHasher(Ci.nsICryptoHMAC.SHA256, hmac_key);

    callback();
  },

  _computeKeyVerification: function _computeKeyVerification(callback) {
    this._log.trace("Encrypting key verification value.");
    let iv, ciphertext;
    try {
      iv = Svc.Crypto.generateRandomIV();
      ciphertext = Svc.Crypto.encrypt(JPAKE_VERIFY_VALUE,
                                      this._crypto_key, iv);
    } catch (ex) {
      this._log.error("Failed to encrypt key verification value.");
      this.abort(JPAKE_ERROR_INTERNAL);
      return;
    }
    this._outgoing = {type: this._my_signerid + "3",
                      payload: {ciphertext: ciphertext, IV: iv}};
    this._log.trace("Generated message " + this._outgoing.type);
    callback();
  },

  _encryptData: function _encryptData(callback) {
    this._log.trace("Verifying their key.");
    if (this._incoming.type != this._their_signerid + "3") {
      this._log.error("Invalid round 3 data: " +
                      JSON.stringify(this._incoming));
      this.abort(JPAKE_ERROR_WRONGMESSAGE);
      return;
    }
    let step3 = this._incoming.payload;
    try {
      ciphertext = Svc.Crypto.encrypt(JPAKE_VERIFY_VALUE,
                                      this._crypto_key, step3.IV);
      if (ciphertext != step3.ciphertext)
        throw "Key mismatch!";
    } catch (ex) {
      this._log.error("Keys don't match!");
      this.abort(JPAKE_ERROR_KEYMISMATCH);
      return;
    }

    this._log.trace("Encrypting data.");
    let iv, ciphertext, hmac;
    try {
      iv = Svc.Crypto.generateRandomIV();
      ciphertext = Svc.Crypto.encrypt(this._data, this._crypto_key, iv);
      hmac = Utils.bytesAsHex(Utils.digestUTF8(ciphertext, this._hmac_hasher));
    } catch (ex) {
      this._log.error("Failed to encrypt data.");
      this.abort(JPAKE_ERROR_INTERNAL);
      return;
    }
    this._outgoing = {type: this._my_signerid + "3",
                      payload: {ciphertext: ciphertext, IV: iv, hmac: hmac}};
    this._log.trace("Generated message " + this._outgoing.type);
    callback();
  },

  _decryptData: function _decryptData(callback) {
    this._log.trace("Verifying their key.");
    if (this._incoming.type != this._their_signerid + "3") {
      this._log.error("Invalid round 3 data: "
                      + JSON.stringify(this._incoming));
      this.abort(JPAKE_ERROR_WRONGMESSAGE);
      return;
    }
    let step3 = this._incoming.payload;
    try {
      let hmac = Utils.bytesAsHex(
        Utils.digestUTF8(step3.ciphertext, this._hmac_hasher));
      if (hmac != step3.hmac)
        throw "HMAC validation failed!";
    } catch (ex) {
      this._log.error("HMAC validation failed.");
      this.abort(JPAKE_ERROR_KEYMISMATCH);
      return;
    }

    this._log.trace("Decrypting data.");
    let cleartext;
    try {      
      cleartext = Svc.Crypto.decrypt(step3.ciphertext, this._crypto_key,
                                     step3.IV);
    } catch (ex) {
      this._log.error("Failed to decrypt data.");
      this.abort(JPAKE_ERROR_INTERNAL);
      return;
    }

    try {
      this._newData = JSON.parse(cleartext);
    } catch (ex) {
      this._log.error("Invalid data data: " + JSON.stringify(cleartext));
      this.abort(JPAKE_ERROR_INVALID);
      return;
    }

    this._log.trace("Decrypted data.");
    callback();
  },

  _complete: function _complete() {
    this._log.debug("Exchange completed.");
    this._finished = true;
    Utils.namedTimer(function () { this.observer.onComplete(this._newData); },
                     0, this, "_timer_onComplete");
  }

};
