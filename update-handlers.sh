#!/bin/bash
FILES=$(find app/api -name "route.ts" -type f -exec grep -l -E "context, *user" {} \;)
echo "Found $(echo "$FILES" | wc -l | tr -d ' ') files to update"
for file in $FILES; do
  echo "Updating $file"
  sed -i '' -E 's/async *\(request(: Request)?, context, user\) *=>/async (request\1, context) => {
    const { user } = context;/g' "$file"
done
echo "Update complete"
