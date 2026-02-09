# Browser Test Checklist

## Auth Flow
- [ ] Sign in page loads at /sign-in
- [ ] Google OAuth button appears
- [ ] Dev mode: email/password fields appear
- [ ] After sign in: redirected to main app
- [ ] User menu shows avatar and sign out

## Session Management
- [ ] Session list loads in sidebar
- [ ] "New Session" button creates session
- [ ] Session shows "creating" status initially
- [ ] Session becomes "active" after sandbox ready
- [ ] Click session loads chat view
- [ ] Session title auto-updates
- [ ] Delete session works
- [ ] Fork session creates new session

## Chat
- [ ] Message input accepts text
- [ ] Enter sends message
- [ ] Shift+Enter creates newline
- [ ] Streaming response appears incrementally
- [ ] "Working" indicator shows during processing
- [ ] Abort button stops generation
- [ ] Agent selector works
- [ ] Model selector works

## IDE Mode
- [ ] IDE toggle switches layout
- [ ] File explorer shows file tree
- [ ] Clicking file opens in tab
- [ ] Multiple tabs work
- [ ] Closing tab works
- [ ] Code has syntax highlighting

## Tool Calls
- [ ] Tool cards show collapsed by default
- [ ] Click expands tool details
- [ ] Edit tools show diff (not collapsed)
- [ ] Read tool shows highlighted code
- [ ] Bash tool shows command and output
- [ ] Agent invocations show styled badge

## @pierre/diffs
- [ ] Diffs render with colored highlighting
- [ ] Accept button on diffs
- [ ] Reject button on diffs
- [ ] Line selection shows comment input
- [ ] Comments accumulate
- [ ] "n comments" badge shows in input
- [ ] Comments sent with message

## Terminal
- [ ] Terminal button opens overlay
- [ ] Terminal connects to sandbox SSH
- [ ] Commands can be typed and executed
- [ ] Output displays correctly
- [ ] Close button works
- [ ] Green icon when connected

## Context & Sources
- [ ] Token usage shows per message
- [ ] Sources list shows referenced files

## Dark Mode
- [ ] Toggle dark/light mode
- [ ] All components render correctly in both modes
- [ ] Code highlighting themes switch properly

## Responsive
- [ ] Sidebar collapses on mobile
- [ ] Hamburger menu works
- [ ] Chat input usable on mobile
