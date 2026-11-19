const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RULE = `
# whisper.rn
-keep class com.rnwhisper.** { *; }
`;

function withWhisper(config) {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const proguard = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      if (fs.existsSync(proguard)) {
        const text = fs.readFileSync(proguard, 'utf8');
        if (!text.includes('com.rnwhisper')) {
          fs.writeFileSync(proguard, `${text.trim()}\n${RULE}`);
        }
      }
      const gradleProperties = path.join(mod.modRequest.platformProjectRoot, 'gradle.properties');
      if (fs.existsSync(gradleProperties)) {
        const text = fs.readFileSync(gradleProperties, 'utf8');
        const memory = 'org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8';
        const next = text.includes('org.gradle.jvmargs=')
          ? text.replace(/org\.gradle\.jvmargs=.*/g, memory)
          : `${text.trim()}\n${memory}\n`;
        if (next !== text) fs.writeFileSync(gradleProperties, next.endsWith('\n') ? next : `${next}\n`);
      }
      return mod;
    },
  ]);
}

module.exports = withWhisper;
