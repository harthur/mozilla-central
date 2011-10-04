/* vim: set ts=2 et sw=2 tw=80: */
/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

Cu.import("resource:///modules/scratchpad-manager.jsm");

/* Call the iterator for each item in the list, 
   calling the final callback with all the results
   after every iterator call has sent its result */
function asyncMap(items, iterator, callback)
{
  let expected = items.length;
  let results = [];

  items.forEach(function(item) {
    iterator(item, function(result) {
      results.push(result);
      if (results.length == expected) {
        callback(results);
      }
    });
  });
}

function test()
{
  ScratchpadManager.init();

  waitForExplicitFinish();
  testRestore();
}

function testRestore()
{
  let states = [
    {
      filename: "testfile",
      text: "test1",
      executionContext: 2
    },
    {
      text: "text2",
      executionContext: 1
    },
    {
      text: "text3",
      executionContext: 1
    }
  ];

  asyncMap(states, function(state, done) {
    // Open some scratchpad windows
    let win = ScratchpadManager.openScratchpad(state);
    win.addEventListener("load", function() {
      done(win);
    })
  },
  function(wins) {
    // Then save the windows to session store
    ScratchpadManager.saveOpenWindows(function() {
      // Then close them
      wins.forEach(function(win) {
        win.close(); 
      });

      // Then restore them
      ScratchpadManager.restoreSession(function(restoredWins) {
        is(restoredWins.length, 3, "Three scratchad windows restored");

        asyncMap(restoredWins, function(restoredWin, done) {
          restoredWin.addEventListener("load", function() {
            let state = restoredWin.Scratchpad.getState();
            done(state);
            restoredWin.close();
          });
        }, 
        function(restoredStates) {
          // Then make sure they were restored with the right states
          ok(statesMatch(states, restoredStates),
            "All scratchpad window states restored correctly");
            
          // Yay, we're done!
          finish();
        });
      });
    });
  });
}

function statesMatch(states, restoredStates)
{
  return states.every(function(state) {
    return restoredStates.some(function(restoredState) {
      return state.filename == restoredState.filename
        && state.text == restoredState.text
        && state.executionContext == restoredState.executionContext;
    })
  });
}
