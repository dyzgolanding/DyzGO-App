const fs = require('fs');
const files = [
  'app/(profile)/saved.tsx',
  'app/(profile)/my-friends.tsx',
  'app/(settings)/settings.tsx',
  'app/(settings)/help.tsx',
  'app/(settings)/payment-methods.tsx',
  'app/(events)/brand-profile.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.match(/import\s+{([^}]*)}\s+from\s+['"]react-native['"]/m)) {
      content = content.replace(/import\s+{([^}]*)}\s+from\s+['"]react-native['"]/m, (fullMatch, group1) => {
          if (!group1.includes('Platform')) {
              return `import { Platform, ${group1.trim()} } from 'react-native'`;
          }
          return fullMatch;
      });
  } else {
      content = `import { Platform } from 'react-native';\n${content}`;
  }
  fs.writeFileSync(file, content, 'utf8');
  console.log('Fixed:', file);
}
