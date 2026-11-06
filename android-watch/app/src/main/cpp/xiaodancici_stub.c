/*
 * Tiny no-op native library shipped only so the APK carries a real
 * lib/armeabi-v7a shared object. Some watch installers / package inspectors
 * (OPPO ColorOS Watch, LibChecker) behave badly with pure-Java APKs.
 *
 * The app itself is a WebView shell and does not need native code.
 * Keeping at least one 32-bit ARM library present also pins the package
 * to the ABI the Watch 3 family uses.
 */

#include <jni.h>

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *reserved) {
    (void) vm;
    (void) reserved;
    return JNI_VERSION_1_6;
}

JNIEXPORT jint JNICALL
xiaodancici_stub_version(void) {
    return 1;
}
