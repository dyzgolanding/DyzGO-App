const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

walkDir(path.join(__dirname, 'app'), (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Check if it has Dimensions.get('window')
    if (content.includes("Dimensions.get('window')") || content.includes('Dimensions.get("window")')) {
      
      // Make sure Platform is imported if not
      if (!content.includes('import {') && content.includes('react-native')) {
        // very edge case, skip
      } else if (!content.includes('Platform') && content.includes('react-native')) {
        content = content.replace(/import\s+{([^}]*)}\s+from\s+['"]react-native['"];?/, (match, p1) => {
          return `import { ${p1}, Platform } from 'react-native';`;
        });
        modified = true;
      }
      
      // Replace Dimensions.get('window') with our capped version
      // But only if we haven't already replaced it with something ugly
      if (!content.includes('Math.min(Dimensions.get')) {
        // We will replace `Dimensions.get('window')` with `(Platform.OS === 'web' ? { ...Dimensions.get('window'), width: Math.min(Dimensions.get('window').width, 480) } : Dimensions.get('window'))`
        content = content.replace(/Dimensions\.get\(['"]window['"]\)/g, "(Platform.OS === 'web' ? { ...Dimensions.get('window'), width: Math.min(Dimensions.get('window').width, 480) } : Dimensions.get('window'))");
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Patched:', filePath);
    }
  }
});
