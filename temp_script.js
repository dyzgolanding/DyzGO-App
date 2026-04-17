const fs = require('fs');
const files = [
  'app/(tickets)/my-tickets.tsx',
  'app/(profile)/saved.tsx',
  'app/(profile)/my-friends.tsx',
  'app/(profile)/achievements.tsx',
  'app/(profile)/rankings.tsx',
  'app/(settings)/settings.tsx',
  'app/(settings)/help.tsx',
  'app/(settings)/payment-methods.tsx',
  'app/(events)/brand-profile.tsx',
  'app/(tickets)/select-tickets.tsx',
  'app/(tickets)/payment.tsx'
];

let changedFiles = 0;
for (const file of files) {
  if (!fs.existsSync(file)) {
      console.log('No existe:', file);
      continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  
  const regex = /(<View style=\{StyleSheet\.absoluteFill\} pointerEvents="none">\s*(?:<LinearGradient[\s\S]*?\/>\s*)+<\/View>)/g;
  
  const initialContent = content;
  content = content.replace(regex, (match) => {
    if (match.includes("Platform.OS") || match.includes("!== 'web'")) {
        return match;
    }
    const index = initialContent.indexOf(match);
    if (index > -1) {
        const preContext = initialContent.substring(Math.max(0, index - 20), index);
        if (preContext.includes("'web'")) {
            return match; 
        }
    }
    
    if ((match.match(/<LinearGradient/g) || []).length >= 2) {
        return "{Platform.OS !== 'web' && (\n" + match + "\n)}";
    }
    
    return match;
  });
  
  if (content !== initialContent) {
    if (!content.includes("Platform") && content.includes("react-native")) {
        content = content.replace(/import\s+{([^}]*)}\s+from\s+['"]react-native['"]/, (fullMatch, group1) => {
            if (!group1.includes("Platform")) {
                return `import { Platform, ${group1.trim()} } from 'react-native'`;
            }
            return fullMatch;
        });
    }
    
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log('Modificado:', file);
  }
}
console.log('Total modificados:', changedFiles);
