# KAMPYN Backend - Git Workflow Guide

*Project under **EXSOLVIA** - Excellence in Software Solutions*

## Branch Naming Convention

### Branch Types and Patterns

#### Feature Branches
```bash
feature/description-of-feature
feature/user-authentication
feature/payment-integration
feature/inventory-management
```

#### Bug Fix Branches
```bash
fix/description-of-bug
fix/payment-validation-error
fix/order-status-update-issue
fix/authentication-token-expiry
```

#### Hotfix Branches
```bash
hotfix/critical-issue-description
hotfix/security-vulnerability-patch
hotfix/production-server-crash
hotfix/payment-gateway-outage
```

#### Documentation Branches
```bash
docs/description-of-documentation
docs/api-reference-update
docs/deployment-guide-addition
docs/readme-improvements
```

#### Refactoring Branches
```bash
refactor/description-of-refactoring
refactor/order-processing-logic
refactor/database-schema-optimization
refactor/authentication-middleware
```

### Branch Naming Rules
- Use lowercase letters only
- Use hyphens (-) to separate words
- Be descriptive but concise
- Start with the branch type prefix
- No special characters or spaces

## Commit Message Format

### Conventional Commits Specification

#### Commit Structure
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Commit Types

##### Primary Types
```bash
feat:     # New feature for the user
fix:      # Bug fix for the user
docs:     # Documentation changes only
style:    # Code style changes (formatting, semicolons, etc.)
refactor: # Code change that neither fixes a bug nor adds a feature
perf:     # Performance improvements
test:     # Adding or updating tests
chore:    # Changes to build process, auxiliary tools, etc.
```

##### Extended Types
```bash
ci:       # Changes to CI configuration files and scripts
build:    # Changes that affect the build system or external dependencies
revert:   # Reverts a previous commit
```

#### Commit Examples

##### Feature Commits
```bash
git commit -m "feat: implement JWT-based user authentication"
git commit -m "feat(auth): add Google OAuth integration"
git commit -m "feat(payment): integrate Razorpay payment gateway"
git commit -m "feat(inventory): add real-time stock tracking"
```

##### Bug Fix Commits
```bash
git commit -m "fix: resolve order status update issue"
git commit -m "fix(payment): correct payment validation logic"
git commit -m "fix(auth): handle token expiry edge case"
git commit -m "fix(inventory): prevent negative stock quantities"
```

##### Documentation Commits
```bash
git commit -m "docs: update API reference documentation"
git commit -m "docs(readme): improve installation instructions"
git commit -m "docs(api): add authentication endpoint examples"
```

##### Refactoring Commits
```bash
git commit -m "refactor: optimize database query performance"
git commit -m "refactor(auth): simplify token validation logic"
git commit -m "refactor(order): improve order processing workflow"
```

##### Performance Commits
```bash
git commit -m "perf: optimize MongoDB aggregation queries"
git commit -m "perf(cache): implement Redis caching for user data"
git commit -m "perf(api): reduce response time for order endpoints"
```

##### Testing Commits
```bash
git commit -m "test: add unit tests for authentication service"
git commit -m "test(integration): add API endpoint integration tests"
git commit -m "test(e2e): add end-to-end order flow tests"
```

##### Chore Commits
```bash
git commit -m "chore: update dependencies to latest versions"
git commit -m "chore(deps): upgrade Express.js to version 4.18"
git commit -m "chore(ci): update GitHub Actions workflow"
```

### Commit Message Rules

#### Description Rules
- Use imperative mood ("add feature" not "added feature")
- Start with lowercase letter
- No period at the end
- Maximum 72 characters for the first line
- Be clear and descriptive

#### Body Rules (Optional)
- Wrap at 72 characters
- Explain what and why, not how
- Use bullet points for multiple changes
- Reference issues with "#issue_number"

#### Footer Rules (Optional)
- Reference breaking changes with "BREAKING CHANGE:"
- Reference issues with "Closes #issue_number"
- Reference pull requests with "Refs #pr_number"

### Advanced Commit Examples

#### Feature with Scope and Body
```bash
git commit -m "feat(auth): implement multi-factor authentication

Add support for TOTP-based two-factor authentication to enhance
security for user accounts. Includes:

- TOTP secret generation and validation
- QR code generation for authenticator apps
- Backup codes for account recovery
- Updated authentication middleware

Closes #123"
```

#### Bug Fix with Breaking Change
```bash
git commit -m "fix(api): correct order status validation

BREAKING CHANGE: Order status enum values have changed

The order status values have been updated to be more consistent
across the application. Old status values will no longer work.

Migration guide available in docs/migration.md

Closes #456"
```

## Git Workflow Process

### 1. Creating a New Branch
```bash
# Start from main branch
git checkout main
git pull origin main

# Create and switch to new feature branch
git checkout -b feature/user-authentication

# Or create branch from specific commit
git checkout -b feature/payment-integration 1234567
```

### 2. Making Changes and Commits
```bash
# Make your changes
# Stage changes
git add .

# Commit with proper message
git commit -m "feat: implement user registration endpoint"

# Continue making commits as needed
git commit -m "feat: add email verification for new users"
git commit -m "test: add unit tests for user registration"
git commit -m "docs: update API documentation for auth endpoints"
```

### 3. Pushing to Remote
```bash
# Push branch to remote repository
git push origin feature/user-authentication

# Set upstream for future pushes
git push -u origin feature/user-authentication
```

### 4. Creating Pull Request
- Create PR with descriptive title and description
- Link related issues
- Add appropriate labels
- Request code review from team members

### 5. Code Review Process
- Address review comments
- Make additional commits if needed
- Squash commits if requested
- Ensure all CI checks pass

### 6. Merging and Cleanup
```bash
# After PR is approved and merged
git checkout main
git pull origin main

# Delete local feature branch
git branch -d feature/user-authentication

# Delete remote branch (if not auto-deleted)
git push origin --delete feature/user-authentication
```

## Branch Protection Rules

### Main Branch Protection
- Require pull request reviews
- Require status checks to pass
- Require branches to be up to date
- Restrict pushes to main branch
- Require linear history

### Development Branch Protection
- Require pull request reviews
- Require status checks to pass
- Allow force pushes (with restrictions)

## Release Workflow

### Release Branch Creation
```bash
# Create release branch from main
git checkout main
git pull origin main
git checkout -b release/v1.2.0
git push -u origin release/v1.2.0
```

### Release Process
```bash
# Make release-specific commits
git commit -m "chore: bump version to 1.2.0"
git commit -m "docs: update changelog for v1.2.0"

# Create and push tag
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0
```

### Hotfix Process
```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-security-fix

# Make hotfix commits
git commit -m "fix: resolve critical security vulnerability"

# Merge to main and develop
git checkout main
git merge hotfix/critical-security-fix
git checkout develop
git merge hotfix/critical-security-fix

# Delete hotfix branch
git branch -d hotfix/critical-security-fix
```

## Best Practices

### Commit Best Practices
- Make atomic commits (one logical change per commit)
- Write clear, descriptive commit messages
- Test your changes before committing
- Use conventional commit format
- Keep commits focused and small

### Branch Best Practices
- Use descriptive branch names
- Keep branches up to date with main
- Delete merged branches
- Use feature flags for incomplete features
- Regularly sync with remote repository

### Code Review Best Practices
- Review code thoroughly
- Provide constructive feedback
- Test changes locally when possible
- Check for security vulnerabilities
- Ensure documentation is updated

---

**© 2025 EXSOLVIA. All rights reserved.**
