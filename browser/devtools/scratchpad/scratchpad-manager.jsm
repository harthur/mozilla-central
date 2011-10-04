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

const SCRATCHPAD_WINDOW_URL = "chrome://browser/content/scratchpad.xul";
const SCRATCHPAD_WINDOW_FEATURES = "chrome,titlebar,toolbar,centerscreen,resizable,dialog=no";

Cu.import("resource://gre/modules/Services.jsm");

/**
 * The ScratchpadManager object opens new Scratchpad windows and manages the state
 * of open scratchpads for session restore. There's only one ScratchpadManager in
 * the life of the browser.
 */
var ScratchpadManager = {
  /**
   * Get the states of all open scratchpad windows
   */
  getSessionState: function SPM_getSessionState()
  {
    let session = [];

    let enumerator = Services.wm.getEnumerator("devtools:scratchpad");
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (!win.closed) {
        session.push(win.Scratchpad.getState());
      }
    }
    return session;
  },
  
  /**
   * Restore scratchpad windows from the scratchpad session store file.
   * Called by session restore.
   *
   * @param function aSession
   *        The session object with scratchpad states.
   *
   * @param function aCallback
   *        Optional. Function called when session has been restored
   */
  restoreSession: function SPM_restoreSession(aSession, aCallback)
  {
    states.forEach(function(state) {
      this.openScratchpad(state)
    }, this);
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
    
    return win;
  }
};
