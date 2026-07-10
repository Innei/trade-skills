#import <Foundation/Foundation.h>
#import <Sparkle/Sparkle.h>
#include <napi.h>

// Sparkle needs SPUUpdaterDelegate to observe a check cycle finishing/aborting; we log
// through it purely for diagnostics (no NSAlert or unified-log line is otherwise
// guaranteed for a headless run in a sandbox with no attached display).
@interface SparkleBridgeLogDelegate : NSObject <SPUUpdaterDelegate>
@end

@implementation SparkleBridgeLogDelegate

- (void)updater:(SPUUpdater *)updater didFinishUpdateCycleForUpdateCheck:(SPUUpdateCheck)updateCheck error:(nullable NSError *)error {
  if (error != nil) {
    NSLog(@"[sparkle-bridge] update cycle finished with error: %@", error);
  } else {
    NSLog(@"[sparkle-bridge] update cycle finished with no error (no update found or update path taken)");
  }
}

- (void)updater:(SPUUpdater *)updater didAbortWithError:(NSError *)error {
  NSLog(@"[sparkle-bridge] update check aborted: %@", error);
}

@end

namespace {

SPUStandardUpdaterController *g_controller = nil;
SparkleBridgeLogDelegate *g_logDelegate = nil;

NSString *NapiStringToNSString(const Napi::Value &value) {
  if (!value.IsString()) return nil;
  std::string s = value.As<Napi::String>().Utf8Value();
  return [NSString stringWithUTF8String:s.c_str()];
}

Napi::Value Init(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "init(options) requires an options object").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object options = info[0].As<Napi::Object>();
  NSString *appcastUrl = options.Has("appcastUrl") ? NapiStringToNSString(options.Get("appcastUrl")) : nil;
  NSString *publicEdKey = options.Has("publicEdKey") ? NapiStringToNSString(options.Get("publicEdKey")) : nil;

  __block BOOL initialized = NO;

  void (^work)(void) = ^{
    if (g_controller != nil) {
      initialized = YES;
      return;
    }

    @try {
      g_logDelegate = [[SparkleBridgeLogDelegate alloc] init];
      g_controller = [[SPUStandardUpdaterController alloc] initWithStartingUpdater:YES
                                                                    updaterDelegate:g_logDelegate
                                                                userDriverDelegate:nil];

      NSBundle *hostBundle = [NSBundle mainBundle];
      NSString *plistFeedUrl = hostBundle.infoDictionary[@"SUFeedURL"];
      NSString *plistPublicKey = hostBundle.infoDictionary[@"SUPublicEDKey"];

      if (appcastUrl != nil && plistFeedUrl == nil) {
        // Info.plist SUFeedURL is the packaged-build source of truth; -setFeedURL: is a
        // documented (if deprecated) escape hatch for configuring it out-of-plist, which we
        // use only when the plist key is absent (e.g. dev-shell runs against a stub bundle).
        NSURL *url = [NSURL URLWithString:appcastUrl];
        if (url != nil) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
          [g_controller.updater setFeedURL:url];
#pragma clang diagnostic pop
        }
      }

      if (publicEdKey != nil && plistPublicKey == nil) {
        // Sparkle deliberately exposes no public runtime API to set SUPublicEDKey — the
        // signing key must live in the signed Info.plist so a compromised JS layer can't
        // swap in an attacker key at runtime. We can only surface the mismatch, not fix it.
        NSLog(
            @"[sparkle-bridge] publicEdKey was supplied but Info.plist has no SUPublicEDKey; "
             "Sparkle has no supported runtime setter for it — the key must be baked into the "
             "signed Info.plist at package time.");
      }

      initialized = YES;
    } @catch (NSException *exception) {
      NSLog(@"[sparkle-bridge] init threw: %@", exception.reason);
      g_controller = nil;
      initialized = NO;
    }
  };

  if ([NSThread isMainThread]) {
    work();
  } else {
    dispatch_sync(dispatch_get_main_queue(), work);
  }

  return Napi::Boolean::New(env, initialized);
}

Napi::Value CheckForUpdates(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  void (^work)(void) = ^{
    if (g_controller == nil) return;
    @try {
      NSLog(@"[sparkle-bridge] checkForUpdates: canCheckForUpdates=%d sessionInProgress=%d",
            g_controller.updater.canCheckForUpdates, g_controller.updater.sessionInProgress);
      [g_controller checkForUpdates:nil];
    } @catch (NSException *exception) {
      NSLog(@"[sparkle-bridge] checkForUpdates threw: %@", exception.reason);
    }
  };

  if ([NSThread isMainThread]) {
    work();
  } else {
    dispatch_async(dispatch_get_main_queue(), work);
  }

  return env.Undefined();
}

Napi::Value SetAutomaticChecks(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsBoolean()) {
    Napi::TypeError::New(env, "setAutomaticChecks(enabled) requires a boolean").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  bool enabled = info[0].As<Napi::Boolean>().Value();

  void (^work)(void) = ^{
    if (g_controller == nil) return;
    @try {
      g_controller.updater.automaticallyChecksForUpdates = enabled;
    } @catch (NSException *exception) {
      NSLog(@"[sparkle-bridge] setAutomaticChecks threw: %@", exception.reason);
    }
  };

  if ([NSThread isMainThread]) {
    work();
  } else {
    dispatch_async(dispatch_get_main_queue(), work);
  }

  return env.Undefined();
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "init"), Napi::Function::New(env, Init));
  exports.Set(Napi::String::New(env, "checkForUpdates"), Napi::Function::New(env, CheckForUpdates));
  exports.Set(Napi::String::New(env, "setAutomaticChecks"), Napi::Function::New(env, SetAutomaticChecks));
  return exports;
}

}  // namespace

NODE_API_MODULE(sparkle_bridge, InitModule)
