# First store release — preparation draft

This is a preparation document, not evidence of signing, store submission or acceptance. Current build: 0.3.0 alpha.

## Listing copy

**TimeHarbor — Make room for what matters.**

Build healthier browsing routines with website time limits, timely breaks and a clearer picture of your day. Set daily allowances or windows that begin with your first use, reuse break routines across sites, and review your usage locally. Optional PIN controls support personal discipline and family routines. Settings can be moved between browsers with a JSON file.

TimeHarbor is open source, has no analytics and does not send your browsing reports to its developer. It is a browser-level aid: ordinary installations can be removed and this version does not include automatic adult-content filtering or automatic cross-browser sync.

**تایم‌هاربر — برای چیزهای مهم‌تر وقت بساز.**

برای هر سایت سهمیه زمان تعیین کنید، میان استفاده استراحت کنید و تصویر روشن‌تری از روزتان داشته باشید. سهمیه‌ها می‌توانند روزانه یا در بازه‌ای از اولین استفاده باشند. برنامه‌های استراحت را برای چند سایت به کار ببرید و گزارش مصرف را روی دستگاه خودتان ببینید. پین اختیاری به نظم شخصی و برنامه‌های خانوادگی کمک می‌کند. تنظیمات با فایل بین مرورگرها قابل انتقال‌اند.

تایم‌هاربر متن‌باز است، تحلیل‌گر تبلیغاتی ندارد و گزارش مرور شما را برای سازنده نمی‌فرستد. این نسخه یک ابزار کمکی در سطح مرورگر است؛ نصب عادی قابل حذف است و فیلتر خودکار محتوای بزرگسالان یا سینک خودکار بین مرورگرها هنوز ندارد.

## Author and contact

Saeed Sepehr · سعید سپهر. Contact links are maintained in the in-app About page. Bug reports and ideas: <https://github.com/saeedsepehr/TimeHarbor/issues>. Privacy: [PRIVACY.md](../PRIVACY.md). License: MIT.

## Permission explanations

| Permission | Purpose |
| --- | --- |
| HTTP(S) host access | Observe interaction/media timing and enforce configured website rules. No page-text or keystroke collection. |
| tabs | Track tab/window identity and redirect tabs to the local lock page. |
| storage | Store settings, PIN verifier, local reports and recovery checkpoints. |
| alarms | Recovery/checkpoints and reconciliation of time-dependent rules. |
| webRequest / webRequestBlocking (Firefox) | Enforce top-level navigation policy using Firefox's blocking API. |
| declarativeNetRequestWithHostAccess (Chromium) | Enforce declarative main-frame rules while the worker can sleep. |

No remote executable code, content classifier service, analytics, social embeds or cloud report upload.

## Submission preparation

- Reproduce with Node 22.14+, `npm ci`, type/unit checks, both build targets and the documented browser tests.
- Firefox: review `outputs/timeharbor-0.3.0.zip`, provide source/build instructions as requested, and submit through the owner's Mozilla developer account for signing/review. Keep the existing Gecko ID.
- Chromium: review `outputs/timeharbor-chromium-0.3.0.zip` and submit through the owner's store publisher account. Chrome and Edge have separate listings and review processes.
- Use bundled 128px PNG icon and current screenshots; inspect store-specific asset requirements during submission.
- Review translations, real YouTube/Aparat playback modes and target operating systems before claiming stable support. Current automated browser results cover Windows only.
- Do not describe the extension as tamper-proof parental control or as a comprehensive child-safety filter. Online adult-domain lists are still roadmap work.

No store credentials or signing keys are stored in the repository. Store publication has not been performed in this change.
