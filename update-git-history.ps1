# Git History Rewrite Script
# This will update all commits from your old email/name to your new one

$OLD_EMAIL = "hello@filled.wtf"
$CORRECT_NAME = "FLIPPING-PROFITS"
$CORRECT_EMAIL = "211458520+FLIPPING-PROFITS@users.noreply.github.com"

Write-Host "⚠️  WARNING: This will rewrite Git history!" -ForegroundColor Yellow
Write-Host "Old email: $OLD_EMAIL" -ForegroundColor Red
Write-Host "New name: $CORRECT_NAME" -ForegroundColor Green
Write-Host "New email: $CORRECT_EMAIL" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to continue or Ctrl+C to cancel..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host "`nRewriting history..." -ForegroundColor Cyan

git filter-branch --env-filter "
    if [ `"`$GIT_COMMITTER_EMAIL`" = `"$OLD_EMAIL`" ]
    then
        export GIT_COMMITTER_NAME=`"$CORRECT_NAME`"
        export GIT_COMMITTER_EMAIL=`"$CORRECT_EMAIL`"
    fi
    if [ `"`$GIT_AUTHOR_EMAIL`" = `"$OLD_EMAIL`" ]
    then
        export GIT_AUTHOR_NAME=`"$CORRECT_NAME`"
        export GIT_AUTHOR_EMAIL=`"$CORRECT_EMAIL`"
    fi
" --tag-name-filter cat -- --branches --tags

Write-Host "`n✅ History rewritten!" -ForegroundColor Green
Write-Host "`nNext step: Review the changes with 'git log' and then run:" -ForegroundColor Yellow
Write-Host "git push --force --tags origin 'refs/heads/*'" -ForegroundColor White
