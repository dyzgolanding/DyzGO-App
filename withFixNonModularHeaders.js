const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withFixNonModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfile = path.join(config.modRequest.projectRoot, 'ios', 'Podfile');
      
      // Asegurarse de que el archivo existe (durante prebuild)
      if (!fs.existsSync(podfile)) {
        return config;
      }
      
      let podfileContent = fs.readFileSync(podfile, 'utf8');

      const hook = `
  installer.pods_project.targets.each do |target|
    if ['react-native-maps', 'React-Core'].include?(target.name)
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end
  end
`;

      if (!podfileContent.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES')) {
        podfileContent = podfileContent.replace(
          /post_install do \|installer\|/,
          `post_install do |installer|\n${hook}`
        );
        fs.writeFileSync(podfile, podfileContent);
      }
      
      return config;
    },
  ]);
};
