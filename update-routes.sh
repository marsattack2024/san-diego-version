for file in $FILES; do
  echo "Updating $file"
  sed -i '' 's/export const runtime = 'edge';/export const runtime = 'edge';
export const dynamic = 'force-dynamic';/' "$file"
done
echo "Update complete"
