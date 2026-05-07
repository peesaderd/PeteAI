---
name: ✅ QA Checklist
about: Track QA verification for a feature or release
title: "[QA] "
labels: qa
assignees: peesaderd

---

## Release / Feature
**Version / Feature**: 

## Pre-Checks
- [ ] All unit tests pass (17/17)
- [ ] All E2E tests pass
- [ ] TypeScript compilation passes
- [ ] Docker images build successfully
- [ ] No linting errors

## Functional Testing
- [ ] Homepage loads correctly
- [ ] Navigation sidebar is visible and functional
- [ ] Dashboard page loads
- [ ] API health endpoint returns OK
- [ ] MCP endpoint responds correctly
- [ ] Authentication returns proper status codes
- [ ] 404 handling works for unknown routes

## Integration Testing
- [ ] ERP Core API responds correctly
- [ ] Knowledge Base service is accessible
- [ ] Redis connection works
- [ ] AI Orchestrator endpoints respond

## Regression Testing
- [ ] Existing features still work
- [ ] No new console errors
- [ ] No performance degradation

## Visual QA
- [ ] Layout tests pass (mobile/tablet/desktop)
- [ ] Theme tests pass (light/dark)
- [ ] Accessibility tests pass
- [ ] No visual regressions detected

## Browser Compatibility (UI)
- [ ] Chromium
- [ ] Firefox
- [ ] WebKit

## Notes
Add any additional notes or observations here.
