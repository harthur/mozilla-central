/* vim:set ts=2 sw=2 sts=2 et tw=80:
 * ***** BEGIN LICENSE BLOCK *****
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
 * The Original Code is Scratchpad
 *
 * The Initial Developer of the Original Code is
 * The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Heather Arthur <fayearthur@gmail.com> (original author)
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
 * ***** END LICENSE BLOCK *****/

"use strict";

var EXPORTED_SYMBOLS = ["ScratchpadManager"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const PERM_MASK = parseInt('0666', 8);

const SCRATCHPAD_WINDOW_URL = "chrome://browser/content/scratchpad.xul";
const SCRATCHPAD_WINDOW_FEATURES = "chrome,titlebar,toolbar,centerscreen,resizable,dialog=no";
const SCRATCHPAD_SESSION_FILE = "scratchpads.json";

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");

/**
 * The ScratchpadManager object opens new Scratchpad windows and manages the state
 * of open scratchpads for session restore.
 */
var ScratchpadManager = { 
  /**
   * Whether the manager has been initialized yet.
   */ 
  _initialized: false,
  
  /**
   * States of the open scratchpads.
   */
  _scratchpads: {},

  /**
   * Initialize the scratchpad manager if it hasn't already been initalized.
   * Restores the previous browser session's scratchpad windows
   */
  init: function SPM_init()
  {
    if (this._initialized) {
      return;
    }
  
    this._sessionFile = Services.dirsvc.get("ProfD", Ci.nsILocalFile);
    this._sessionFile.append(SCRATCHPAD_SESSION_FILE);
    if (this._sessionFile.exists()) {
      this._restoreSession();
    }

    this._initialized = true;
  },
  
  /**
   * Restore scratchpad windows from the scratchpad session store file.
   */
  _restoreSession: function SPM_restoreSession()
  {
    var self = this;
    this._readFile(this._sessionFile, function(aStatus, aContent) {
      let states = JSON.parse(aContent || "[]");

      states.forEach(function(state) {
        this.openScratchpad(state);
      }, self);
    });
  },

  /**
   * Open a new scratchpad window with an optional initial state.
   *
   * @param object aState
   *        Optional. The initial state of the scratchpad, an object
   *        with properties filename, text, and executionContext.
   */  
  openScratchpad: function SPM_openScratchpad(aState)
  {
    let params = null;
    if (aState) {
      params = Cc["@mozilla.org/embedcomp/dialogparam;1"]
               .createInstance(Ci.nsIDialogParamBlock);
      params.SetNumberStrings(1);
      params.SetString(0, JSON.stringify(aState));
    }
    let win = Services.ww.openWindow(null, SCRATCHPAD_WINDOW_URL, "_blank",
                                     SCRATCHPAD_WINDOW_FEATURES, params);
    // give the scratchpad window an id for uniquifying the scratchpad
    // states in the session object.
    win.__sid = "scratchpad_" + Date.now();
    
    // Only add shutdown observer if we've opened a scratchpad window
    ShutdownObserver.init();
  },

  /**
   * Save a scratchpad's state to the session store. Called by a
   * scratchpad when it wants to save its state. Right now this
   * is only on shutdown.
   *
   * @param string aSid
   *        The id of the scratchpad window in the session object.
   *
   * @param object aState
   *        The state of the scratchpad, an object
   *        with properties filename, text, and executionContext.
   */
  saveState: function SPM_saveState(aSid, aState)
  {
    this._scratchpads[aSid] = aState;
    this.saveSession();
  },
  
  /**
   * Remove a scratchpad state from the session store. Called by
   * a scratchpad when its window is closed by the user.
   *
   * @param string aId
   *        The id of the scratchpad window in the session object.
   */
  removeState: function SPM_removeState(aSid)
  {
    delete this._scratchpads[aSid];
    this.saveSession();
  },
  
  /**
   * Iterate through open scratchpad windows and save their states
   * to the session store.
   */
  saveOpenWindows: function SPM_saveOpenWindows() {
    let enumerator = Services.wm.getEnumerator("devtools:scratchpad");
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (win.__sid && !win.closed) {
        this._scratchpads[win.__sid] = win.Scratchpad.getState();
      }
    }
    
    this.saveSession();
  },

  /**
   * Save the session object to the session file.
   */
  saveSession: function SPM_saveSession()
  {
    let json = [];
    for (let sid in this._scratchpads) {
      json.push(this._scratchpads[sid]);
    }

    if (!this._sessionFile.exists()) {
      this._sessionFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, PERM_MASK);
    }    
    this._writeFile(this._sessionFile, JSON.stringify(json));
  },

  /**
   * Read the contents of a file asynchronously. Adapted from
   * scratchpad.js importFromFile.
   *
   * @param nsILocalFile aFile
   *        The file to read.
   * @param function aCallback
   *        Function called with the data that was read from the file.
   */
  _readFile: function SP_readFile(aFile, aCallback)
  {
    // Prevent file type detection.
    let channel = NetUtil.newChannel(aFile);
    channel.contentType = "application/javascript";

    let self = this;
    NetUtil.asyncFetch(channel, function(aInputStream, aStatus) {
      let content = null;
      if (Components.isSuccessCode(aStatus)) {
        content = NetUtil.readInputStreamToString(aInputStream,
                                                  aInputStream.available());
      }
      aCallback.call(self, aStatus, content);
    });
  },

  /**
   * Write file to disk. Adapted from nsSessionStore.js _writeFile.
   * @param aFile
   *        nsIFile
   * @param aData
   *        String data
   * @param function aCallback
   *        Optional. Function called with the return code of the write operation.
   */
  _writeFile: function SPM_writeFile(aFile, aData, aCallback) {
    // Initialize the file output stream.
    var ostream = Cc["@mozilla.org/network/safe-file-output-stream;1"].
                  createInstance(Ci.nsIFileOutputStream);
    ostream.init(aFile, 0x02 | 0x08 | 0x20, PERM_MASK, ostream.DEFER_OPEN);

    // Obtain a converter to convert our data to a UTF-8 encoded input stream.
    var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
                    createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";

    // Asynchronously copy the data to the file.
    var istream = converter.convertToInputStream(aData);
    var self = this;
    NetUtil.asyncCopy(istream, ostream, function(rc) {
      if (aCallback) {
        aCallback.call(self, rc)
      }
    });
  }

};


/**
 * The ShutdownObserver listens for app shutdown and saves the current state
 * of the scratchpads for session restore.
 */
var ShutdownObserver = {
  _initialized: false,

  init: function SDO_init()
  {
    if (this._initialized) {
      return;
    }

    Services.obs.addObserver(this, "quit-application-granted", false);
    this.initialized = true;
  },

  observe: function SDO_observe(aMessage, aTopic, aData)
  {
    if (aTopic == "quit-application-granted") {
      ScratchpadManager.appQuitting = true;
      ScratchpadManager.saveOpenWindows();
      this.uninit();
    }
  },

  uninit: function SDO_uninit()
  {
    Services.obs.removeObserver(this, "quit-application-granted");
  }
};
