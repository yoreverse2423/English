# 小单词机 · OPPO Watch WebView 离线版

一个极简 Android WebView 外壳，把仓库根目录的静态版「小单词机」打包成可侧载的手表 APK。

- 包名：`com.xiaodancici.watch`
- 应用名：`小单词机`
- 版本：`versionCode 14` / `versionName 1.0.13`
- 入口：`file:///android_asset/www/index.html`
- `minSdk 24` / `targetSdk 34` / `compileSdk 34`
- 单 Activity、无 ActionBar、全屏 WebView
- JavaScript、DOM Storage、localStorage、file access、混合内容全部启用
- 已声明 `INTERNET`、`ACCESS_NETWORK_STATE`、`VIBRATE`
- 已声明 `android.hardware.type.watch`（`required=false`，兼容非 Wear OS 的 ColorOS Watch）
  与 `com.google.android.wearable.standalone=true`
- 自带 PNG mipmap 图标（方形 + 圆形，mdpi～xxxhdpi）
- **ABI：仅 armeabi-v7a**（32 位 ARM），并携带一个极小的标记用 JNI 库

## 构建

环境：JDK 17、Android SDK Platform 34、Build-Tools 34.0.0。Gradle Wrapper 已包含（Gradle 8.7），AGP 为 8.4.2。

```bash
export JAVA_HOME=/workspace/jdk
export ANDROID_HOME=/workspace/android-sdk
cd /workspace/vocab-app-gh/android-watch
./gradlew :app:assembleRelease
```

产物：

```text
android-watch/app/build/outputs/apk/release/app-release.apk
```

换一台机器构建时，修改 `local.properties`：

```properties
sdk.dir=/path/to/android-sdk
```

并确保已安装 `platforms;android-34` 与 `build-tools;34.0.0`，`JAVA_HOME` 指向 JDK 17。

## 安装到手表

用电脑 ADB：

```bash
adb install -r /workspace/vocab-app-gh/downloads/xiaodancici-watch-armeabi-v7a.apk
```

也可以把 APK 传到手表后，用甲壳虫 ADB 助手等工具安装。首次安装需要允许“未知来源 / ADB 安装”。

## 签名

为了侧载方便，项目内放置了本地自签名密钥：

```text
keystore/watch.jks
alias: xiaodancici-watch
```

密码保存在 `keystore.properties`，`storePassword` 与 `keyPassword` 都是
`xiaodancici-watch-2026`。这是**测试用**密钥，不要用于应用商店；重新签名或长期分发时请生成自己的密钥并妥善备份。

验证签名：

```bash
$ANDROID_HOME/build-tools/34.0.0/apksigner verify --verbose \
  app/build/outputs/apk/release/app-release.apk
```

## 32 位 / ABI 说明

`app/build.gradle` 同时做了三件事：

```groovy
defaultConfig {
    ndk { abiFilters 'armeabi-v7a' }
}
splits {
    abi { enable false }
}
packaging {
    jniLibs {
        excludes += ['lib/arm64-v8a/**', 'lib/x86/**', 'lib/x86_64/**',
                     'lib/mips/**', 'lib/mips64/**']
    }
}
```

本应用是纯 Java + WebView，没有 JNI `.so`，因此 APK 内没有 `lib/` 目录，`aapt dump badging` 也不会出现 `native-code`。没有原生库的 APK 本身就可在 32 位设备上安装运行；`abiFilters` 保证以后即使引入带 JNI 的依赖，也只会打包 armeabi-v7a。

检查：

```bash
$ANDROID_HOME/build-tools/34.0.0/aapt dump badging \
  app/build/outputs/apk/release/app-release.apk | head
unzip -l app/build/outputs/apk/release/app-release.apk | grep -E 'lib/|\.so$' || echo 'no native libs'
```

## Web 资源

APK 内的网页资源位于 `app/src/main/assets/www/`，与仓库根目录保持一致：

```text
index.html
app.js
style.css
words.js
morphology.js
morph-table.js
favicon.ico
favicon-32.png
apple-touch-icon.png
icon-192.png
site.webmanifest
```

`index.html` 使用相对路径加载脚本和样式，`file://` 下可直接工作。修改仓库根目录的 Web 文件后，重新同步资源并构建：

```bash
cd /workspace/vocab-app-gh
cp index.html app.js style.css words.js morphology.js morph-table.js \
  favicon.ico favicon-32.png apple-touch-icon.png icon-192.png site.webmanifest \
  android-watch/app/src/main/assets/www/
cd android-watch
./gradlew :app:assembleRelease
```

## 离线能力

- 词库、学新词、复习、词表浏览、学习统计：离线可用，数据保存在 WebView 的 localStorage。
- 每日阅读生成：需要联网并配置 DeepSeek API Key。
- GitHub 进度同步：需要联网并配置 GitHub 令牌。
- 发音：优先使用有道词典在线音频；离线时回退到系统 Web Speech/TTS。若手表既无网络又无英文 TTS 引擎，发音不可用，但背词主流程不受影响。
