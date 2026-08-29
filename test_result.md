#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#    - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  CarryCue Step 2 Refinement Pass — 4 focused changes:
  1. Rename "Frequently Used" label to "Suggestions" in Home and QuickAdd.
  2. Fix Forgot Something? to always save forgotten record; show "Saved + limit" state when departure is full.
  3. Enforce 5-item limit on total departure items (completed + incomplete both count).
  4. Add item deletion from Home: swipe-left on iOS/Android, onDelete button on web; with Undo toast.
  No backend. No new navigation. No RevenueCat. No notifications.

backend: []

frontend:
  - task: "Rename Frequently Used to Suggestions in Home and QuickAdd"
    implemented: true
    working: "NA"
    file: "app/frontend/app/home.tsx, app/frontend/src/components/QuickAddSheet.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Changed SectionLabel text from 'Frequently used' to 'Suggestions' in:
          - home.tsx (the section above the chips row)
          - QuickAddSheet.tsx (the section shown when text input is empty)
          Internal variable names (frequentlyUsed in store) remain unchanged — not user-facing.

  - task: "Fix Forgot Something at 5-item limit — always save forgotten record"
    implemented: true
    working: "NA"
    file: "app/frontend/app/forgot.tsx, app/frontend/src/state/store.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Changes made:
          1. store.tsx: recordForgotten now returns AddResult (was void).
             Fixed double-count bug: touchUsage called with {forgotten:true} only;
             addItem handles the {added:true} signal internally.
          2. forgot.tsx: save() reads the AddResult.
             - status "ok"/"duplicate": show standard "Saved / We'll remind you next time." + Done.
             - status "limit": show "Saved / We'll remember {name}. / Your next departure is already 
               at the Free 5-item limit." + [Upgrade to Pro] (opens UpgradeSheet) + [Done].
             The forgotten record is ALWAYS persisted before addItem is called.
          
          Test scenarios:
          A) <5 items: type item, tap Add → item appears in Home, savedState = ok.
          B) Exactly 5 items: type item, tap Add → savedState = limit; item NOT added to departure;
             Suggestions still boosted; UpgradeSheet opens when tapping Upgrade to Pro.
          C) After B, reload → forgotten record in Suggestions (stats persisted).

  - task: "5-item limit counts total departure items (completed + incomplete)"
    implemented: true
    working: "NA"
    file: "app/frontend/src/data/limits.ts, app/frontend/src/state/store.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Changes:
          1. limits.ts: renamed maxActiveItems → maxDepartureItems with explicit doc comment
             that completed items count toward the limit.
          2. store.tsx addItem: uses s.items.length >= limits.maxDepartureItems
             (s.items always includes both completed and incomplete items).
          3. store.tsx applyRoutine: uses limits.maxDepartureItems - s.items.length.
          
          Test: Start with 5 items → complete 1 or 2 → attempt to add 6th → must be blocked.
          Pro: Start with 5 items → switch to Pro → can add 6th item freely.

  - task: "Item deletion from Home with Undo"
    implemented: true
    working: "NA"
    file: "app/frontend/app/home.tsx, app/frontend/src/components/Toast.tsx, app/frontend/src/state/store.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Changes:
          1. store.tsx: added restoreItem(item, atIndex) — inserts a CarryItem back at original index
             without running limit check or usage touch (it's a raw restore, not an add).
          2. Toast.tsx: added onUndo? prop. When provided: pointerEvents="box-none", renders
             "Item removed · Undo" with orange "Undo" text. Without onUndo: pointerEvents="none" 
             (existing behavior preserved).
          3. home.tsx:
             - Imports Swipeable from react-native-gesture-handler, CarryItem from models.
             - On iOS/Android: each item wrapped in <Swipeable renderRightActions → red Delete button>.
             - On web: onDelete prop passed to ChecklistItem (shows × button — existing support).
             - handleDelete: gets original index, calls removeItem, sets undoPayload, starts 3s timer.
             - handleUndo: calls restoreItem(undoPayload.item, undoPayload.index), clears undoPayload.
             - Toast shows "Item removed · Undo" when undoPayload is set (onUndo=handleUndo).
             - flash() suppressed while undoPayload active (avoids overwriting undo toast).
          
          Test scenarios:
          A) Delete incomplete item → disappears from list immediately.
          B) Delete completed item → disappears.
          C) Delete → tap Undo within 3s → item restored in original position.
          D) Delete → wait 3s → reload → item is gone (deletion persisted).
          E) Delete item → check usage stats not wiped (item still in Suggestions).

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Rename Frequently Used to Suggestions in Home and QuickAdd"
    - "Fix Forgot Something at 5-item limit — always save forgotten record"
    - "5-item limit counts total departure items (completed + incomplete)"
    - "Item deletion from Home with Undo"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Step 2 Refinement Pass — all 4 changes implemented, TypeScript clean (0 errors), ESLint clean (0 warnings).
      
      Summary of what changed:
      - limits.ts: maxActiveItems renamed to maxDepartureItems.
      - store.tsx: recordForgotten returns AddResult; double-count bug fixed; restoreItem added.
      - home.tsx: "Suggestions" label; Swipeable delete (native) / onDelete (web); Undo toast.
      - QuickAddSheet.tsx: "Suggestions" label.
      - forgot.tsx: handles limit result — shows "Saved + limit" state with Upgrade / Done.
      - Toast.tsx: onUndo prop + orange Undo button + conditional pointerEvents.
      
      Please test all 4 feature areas using the web preview at localhost:3000.
      No credentials needed. No backend. Use the dev tools in Settings (gear icon) to toggle FREE/PRO and reset data.
      
      Key verification steps from the spec:
      1. "Frequently Used" is gone; "SUGGESTIONS" (section label uppercased) appears in Home and QuickAdd.
      2. <5 items: Forgot Something → "Add for next time" → item added, "Saved / remind" state shown.
      3. Exactly 5 items: Forgot Something → "Add for next time" → "Saved / remember X / limit" state + [Upgrade to Pro] + [Done].
      4. Reload after #3: forgotten item should appear in Suggestions chips.
      5. 5 items, complete 2, try adding 6th → blocked (Free).
      6. Switch to PRO → add 6th item → allowed.
      7. Web: delete × button visible on each item → tap → item disappears → "Item removed · Undo" toast.
      8. Tap Undo → item restored.
      9. Delete → wait 3s → reload → item gone.
      10. Deleted item still appears in Suggestions chips (history not wiped).
