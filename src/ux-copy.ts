import type { Language } from "./core.ts";
const copy = {
  cloudProgress: [
    "Initial history sync is continuing in small batches. Local counting remains active.",
    "همگام‌سازی اولیه تاریخچه در دسته‌های کوچک ادامه دارد؛ شمارش محلی فعال است.",
  ],
  eyebrow: ["YOUR TIME, WITH INTENTION", "وقتت، با انتخاب خودت"],
  cloudTitle: [
    "Google Drive sync & backup",
    "همگام‌سازی و پشتیبان Google Drive",
  ],
  cloudHelp: [
    "Optional sync of settings, domain-level usage reports and a shared website allowance. Each browser writes its own counters to avoid double counting. Your PIN and break confirmations remain local.",
    "همگام‌سازی اختیاری تنظیمات، گزارش مصرف دامنه‌ها و سهمیه مشترک سایت‌ها. مصرف هر مرورگر جدا ثبت و ادغام می‌شود تا دوباره‌شماری نشود. پین و تأیید فعالیت استراحت محلی می‌مانند.",
  ],
  cloudSetup: [
    "Google Drive connection is not activated in this development build. You can move settings with Export/Import in the meantime.",
    "اتصال Google Drive در این نسخه آزمایشی فعال نیست. فعلاً می‌توانید تنظیمات را با خروجی و ورودی فایل منتقل کنید.",
  ],
  cloudConnected: [
    "Connected · last successful sync",
    "متصل · آخرین همگام‌سازی موفق",
  ],
  cloudConsent: [
    "I agree to send recorded website domains and usage durations/timestamps to my Google Drive, according to my reporting scope. The OAuth service handles authorization only, not my browsing reports.",
    "موافقم دامنه سایت‌های ثبت‌شده طبق دامنه گزارش‌گیری انتخابی و مدت‌ها و زمان‌های مصرفم در Google Drive خودم ذخیره شوند. سرویس OAuth فقط ورود را انجام می‌دهد، نه پردازش گزارش مرور.",
  ],
  cloudConnect: ["Connect Google account", "اتصال حساب گوگل"],
  cloudInitial: ["When connecting", "هنگام اتصال"],
  cloudRestore: [
    "Use existing cloud settings if available",
    "در صورت وجود، تنظیمات ابر را دریافت کن",
  ],
  cloudUseLocal: [
    "Use this browser’s settings for all installations",
    "تنظیمات این مرورگر برای همه نصب‌ها مبنا باشد",
  ],
  cloudConflict: [
    "After the first connection, concurrent settings edits use a deterministic revision order. Reports and usage counters merge independently.",
    "پس از اتصال اولیه، تغییر هم‌زمان تنظیمات با ترتیب نسخه‌ها حل می‌شود. گزارش‌ها و مصرف هر مرورگر مستقل از تنظیمات ادغام می‌شوند.",
  ],
  cloudSyncNow: ["Sync now", "همگام‌سازی اکنون"],
  cloudDisconnect: ["Disconnect this browser", "قطع اتصال این مرورگر"],
  cloudDisconnectHelp: [
    "Remove this browser’s local authorization and stop cloud requests? Existing Google Drive backups and other browsers are not deleted or disconnected.",
    "مجوز محلی این مرورگر حذف و درخواست‌های ابری متوقف شوند؟ پشتیبان موجود در Drive و اتصال مرورگرهای دیگر حذف نمی‌شوند.",
  ],
  cloudOffline: [
    "Sync runs about once a minute when online. Offline use relies on the last known shared allowance; concurrent offline use can exceed the combined limit until reconnection. Cloud history covers up to 90 days; old backup files remain until removed through Google Drive app management.",
    "در حالت آنلاین تقریباً هر دقیقه همگام می‌شود. آفلاین، آخرین سهمیه مشترک ملاک است؛ استفاده هم‌زمان آفلاین ممکن است تا اتصال دوباره از مجموع سهمیه بیشتر شود. تاریخچه ابری تا ۹۰ روز دریافت می‌شود؛ فایل‌های پشتیبان قدیمی تا حذف از مدیریت برنامه‌های Drive باقی می‌مانند.",
  ],
  cloudError: [
    "Sync did not complete. Local counting continues; retry when connected.",
    "همگام‌سازی کامل نشد. شمارش محلی ادامه دارد؛ پس از اتصال دوباره تلاش کنید.",
  ],
  cloudReauthorize: [
    "Google authorization needs renewal. Disconnect and connect again when ready.",
    "مجوز گوگل نیاز به تمدید دارد؛ در زمان مناسب اتصال را قطع و دوباره برقرار کنید.",
  ],
  cloudTimezone: ["Shared quota time zone", "منطقه زمانی سهمیه مشترک"],
  browserLanguage: ["Use browser language", "زبان مرورگر"],
  quotaAfterBreak: [
    "The break ended, but this website’s time allowance is exhausted. Skipping a break does not reset the allowance.",
    "استراحت تمام شد، ولی سهمیه مصرف این سایت تمام شده است. پرش از استراحت، سهمیه مصرف را بازنشانی نمی‌کند.",
  ],
  missingReturnUrl: [
    "The original website address is unavailable. Open the website again from your browser.",
    "آدرس اصلی سایت در دسترس نیست؛ سایت را دوباره از مرورگر باز کنید.",
  ],
  about: ["About TimeHarbor", "درباره تایم‌هاربر"],
  aboutGuide: [
    "Meet the person behind TimeHarbor, find help, or share an idea.",
    "با سازنده آشنا شوید، راه‌های ارتباط را ببینید و پیشنهاد یا مشکل را مطرح کنید.",
  ],
  authorNote: [
    "Hi, I’m Saeed Sepehr. I built TimeHarbor hoping it can make our time online a little more intentional, help children build healthy habits, and support anyone who finds it hard to notice time passing. This is a small, open-source contribution, made with care. If it helps you, I’m glad. If you spot a bug or have an idea, I’d love to hear from you. Let’s make it better together.",
    "سلام، من سعید سپهرم. تایم‌هاربر را با این امید ساختم که کمی آگاهانه‌تر از زمانمان در اینترنت استفاده کنیم؛ بچه‌ها عادت‌های سالم‌تری بسازند و کسانی که متوجه گذر زمان نمی‌شوند، همراه کوچکی داشته باشند. این یک سهم کوچک و متن‌باز است، با نیت کمک. اگر به کارتان آمد خوشحال می‌شوم؛ اگر باگی دیدید یا پیشنهادی داشتید، با من در تماس باشید. با کمک هم بهترش می‌کنیم.",
  ],
  contact: ["Stay in touch", "در تماس باشیم"],
  bugReport: ["Report a bug or suggest an idea", "گزارش باگ یا پیشنهاد"],
  toolbarHelp: [
    "Can’t see the toolbar icon? Open your browser’s Extensions (puzzle) menu and pin TimeHarbor. Its menu shows this website’s usage, settings and quota-pause controls when available.",
    "آیکن را نمی‌بینید؟ منوی افزونه‌ها با علامت پازل مرورگر را باز کنید و TimeHarbor را به نوار ابزار سنجاق کنید. منوی آن مصرف سایت، تنظیمات و کنترل وقفه سهمیه را در زمان مجاز نشان می‌دهد.",
  ],
  openBreak: ["Open break checklist", "باز کردن چک‌لیست استراحت"],
  transfer: ["Move settings between browsers", "انتقال تنظیمات بین مرورگرها"],
  transferHelp: [
    "Export a settings file here and import it in another browser with TimeHarbor. It includes website rules and profiles, but no PIN, sessions or usage history. Your PIN on this browser stays unchanged. This is a manual transfer, not automatic cross-browser sync.",
    "از تنظیمات فایل بگیرید و در مرورگر دیگری که تایم‌هاربر دارد وارد کنید. قوانین سایت و پروفایل‌ها منتقل می‌شوند؛ پین، نشست ورود و سابقه مصرف منتقل نمی‌شوند. پین این مرورگر تغییر نمی‌کند. این انتقال دستی است، نه همگام‌سازی خودکار بین مرورگرها.",
  ],
  exportSettings: ["Export settings", "خروجی تنظیمات"],
  importSettings: ["Import settings…", "ورود تنظیمات…"],
  importReview: ["Review settings import", "بررسی ورود تنظیمات"],
  importWarning: [
    "This replaces website rules, profiles and general preferences. Usage for matching websites is kept; your local PIN and reports stay on this browser. Keep a backup of your current settings before continuing. For a new installation, set a PIN separately if needed.",
    "این کار قوانین سایت، پروفایل‌ها و ترجیحات عمومی را جایگزین می‌کند. مصرف سایت‌های مشترک حفظ می‌شود؛ پین محلی و گزارش‌های این مرورگر باقی می‌مانند. پیش از ادامه از تنظیمات فعلی خروجی بگیرید. برای نصب تازه، پین را در صورت نیاز جدا تعریف کنید.",
  ],
  importDone: ["Settings imported", "تنظیمات وارد شدند"],
  help: ["Help", "راهنما"],
  how: ["How this page works", "راهنمای این صفحه"],
  sitesGuide: [
    "Give each website a time allowance and choose a break profile. Edit a website directly in its row; use the copy wizard to reuse its settings.",
    "برای هر سایت سهمیه زمان و پروفایل استراحت انتخاب کنید. ویرایش زیر همان سایت باز می‌شود و ویزارد کپی، تنظیمات را به سایت‌های دیگر منتقل می‌کند.",
  ],
  profilesGuide: [
    "A break profile is a reusable routine. Assign it to one or more websites. It controls when to rest, how long to rest, reminders and activity detection—not the website’s time allowance.",
    "پروفایل استراحت یک برنامه قابل استفاده برای چند سایت است: زمان و مدت استراحت، یادآوری‌ها و تشخیص فعالیت را تعیین می‌کند. سهمیه مصرف هر سایت جداگانه تعریف می‌شود.",
  ],
  reportsGuide: [
    "Review recorded website time for a date range, export CSV, and see the break activities you checked off. Paused usage is included in total usage and shown separately.",
    "مصرف ثبت‌شده سایت‌ها را در بازه دلخواه ببینید، CSV بگیرید و فعالیت‌های تأییدشده استراحت را مرور کنید. مصرف هنگام وقفه در مجموع مصرف حساب می‌شود و جدا هم نمایش داده می‌شود.",
  ],
  settingsGuide: [
    "Choose your language, reporting scope, data retention and PIN. These controls apply to the extension as a whole; break timing is managed in Break profiles.",
    "زبان، دامنه گزارش‌گیری، نگهداری داده، پین و اجازه وقفه را تنظیم کنید. این تنظیمات عمومی‌اند؛ زمان‌بندی استراحت در بخش پروفایل استراحت است.",
  ],
  noBreaks: ["No scheduled breaks", "بدون استراحت زمان‌بندی‌شده"],
  newProfile: [
    "＋ Create a new break profile…",
    "＋ ساخت پروفایل استراحت جدید…",
  ],
  addProfile: ["New break profile", "پروفایل استراحت جدید"],
  resetPolicy: ["Allowance resets", "بازنشانی سهمیه"],
  assignedSite: [
    "Only the website using this profile",
    "فقط سایتی که این پروفایل را دارد",
  ],
  linked: ["Websites using this profile", "سایت‌های متصل به این پروفایل"],
  linkedHelp: [
    "Removing a website here only disconnects its break profile. Its website rule and time allowance are preserved, with scheduled breaks turned off.",
    "برداشتن سایت از این فهرست فقط اتصال به پروفایل استراحت را قطع می‌کند. خود سایت و سهمیه زمانش باقی می‌مانند و استراحت زمان‌بندی‌شده‌اش خاموش می‌شود.",
  ],
  detach: ["Disconnect", "قطع اتصال"],
  detachAll: ["Disconnect all websites", "قطع اتصال همه سایت‌ها"],
  detachConfirm: [
    "Disconnect all of these websites? Their time allowances and blocking rules will be kept.",
    "اتصال همه این سایت‌ها قطع شود؟ سهمیه زمان و قوانین مسدودسازی آن‌ها حفظ می‌شوند.",
  ],
  noLinked: [
    "No websites use this profile yet. Assign it from Websites.",
    "هنوز سایتی از این پروفایل استفاده نمی‌کند. از بخش وب‌سایت‌ها آن را به یک سایت وصل کنید.",
  ],
  replaceWith: ["Move connected websites to", "انتقال سایت‌های متصل به"],
  deleteProfile: ["Delete break profile", "حذف پروفایل استراحت"],
  deleteProfileHelp: [
    "Choose where connected websites should move before this profile is deleted. Website time allowances will not change.",
    "پیش از حذف، پروفایل جایگزین سایت‌های متصل را انتخاب کنید. سهمیه زمان سایت‌ها تغییر نمی‌کند.",
  ],
  confirm: ["Confirm", "تأیید"],
  cancel: ["Cancel", "انصراف"],
  close: ["Close", "بستن"],
  next: ["Next", "بعدی"],
  previous: ["Back", "قبلی"],
  copyWizard: ["Copy website settings", "کپی تنظیمات سایت"],
  chooseSource: ["1. Choose the source", "۱. انتخاب سایت مبنا"],
  chooseTargets: ["2. Choose websites", "۲. انتخاب سایت‌های مقصد"],
  reviewCopy: ["3. Review changes", "۳. مرور تغییرات"],
  sourceHelp: [
    "Choose the website whose allowance, reset window and break profile you want to reuse.",
    "سایتی را انتخاب کنید که می‌خواهید سهمیه، بازه بازنشانی و پروفایل استراحتش را کپی کنید.",
  ],
  targetsHelp: [
    "Select websites to update. Websites that already have identical settings are marked and cannot be selected.",
    "سایت‌های مقصد را انتخاب کنید. مواردی که همین تنظیمات را دارند کم‌رنگ‌اند و قابل انتخاب نیستند.",
  ],
  alreadyMatches: ["Already has these settings", "همین تنظیمات را دارد"],
  reviewHelp: [
    "Only the selected websites will change. Their domains and recorded usage will be preserved.",
    "فقط سایت‌های انتخاب‌شده تغییر می‌کنند. نام دامنه و مصرف ثبت‌شده آن‌ها حفظ می‌شود.",
  ],
  apply: ["Apply to selected websites", "اعمال روی سایت‌های انتخاب‌شده"],
  selectedCount: ["Websites selected", "سایت انتخاب‌شده"],
  skip: ["Skip this break", "پرش از این استراحت"],
  allowSkip: ["Allow skipping this break", "اجازه پرش از استراحت"],
  skipHelp: [
    "Off by default. When enabled, a separate Skip button can end a break early. Temporary quota pauses never skip breaks.",
    "پیش‌فرض خاموش است. با روشن‌کردن آن دکمه جداگانه پرش می‌تواند استراحت را زودتر تمام کند. وقفه سهمیه، استراحت را دور نمی‌زند.",
  ],
  remember: ["While you rest, remember to…", "در زمان استراحت یادت باشد…"],
  confirmActivities: [
    "Your break is finished. Confirm what you did.",
    "زمان استراحت تمام شد؛ کارهایی را که انجام دادی تأیید کن.",
  ],
  requiredHelp: [
    "After the timer ends, tick every item to continue.",
    "پس از پایان زمان، برای ادامه همه موارد را تیک بزن.",
  ],
  optionalHelp: [
    "You can check activities at any time. They are saved for your report; continuing after the timer does not depend on them.",
    "هر زمان می‌توانی فعالیت‌ها را تیک بزنی؛ برای گزارش ثبت می‌شوند. ادامه پس از پایان زمان به تیک‌ها وابسته نیست.",
  ],
  breakHistory: ["Break activity report", "گزارش فعالیت‌های استراحت"],
  completed: ["Completed", "تکمیل‌شده"],
  skipped: ["Skipped", "پرش‌شده"],
  pauseHelp: [
    "A PIN-protected exception after a website’s time allowance ends. Usage is still recorded. It does not bypass permanent blocks or health breaks.",
    "اجازه موقت با پین پس از تمام‌شدن سهمیه سایت. مصرف همچنان ثبت می‌شود. مسدودی دائمی و استراحت‌های سلامتی را دور نمی‌زند.",
  ],
  pauseAllowance: ["Daily pause allowance", "سهمیه وقفه روزانه"],
  pauseLeft: ["Pauses remaining today", "وقفه باقی‌مانده امروز"],
  pauseDisabled: [
    "Temporary pauses are disabled in Settings.",
    "وقفه موقت در تنظیمات غیرفعال است.",
  ],
  pinNeeded: [
    "Set a four-digit PIN in Settings to use a temporary pause.",
    "برای استفاده از وقفه، ابتدا در تنظیمات یک پین چهاررقمی تعریف کنید.",
  ],
  idleHelp: [
    "Only the visible tab in the focused browser window is counted. If it has no mouse, keyboard, scroll or media activity for this long, counting also pauses. Other tabs and minimized/unfocused windows stop immediately.",
    "فقط تب قابل مشاهده در پنجره فعال محاسبه می‌شود. تب دیگر، پنجره غیرفعال یا مینیمایز فوراً از شمارش خارج می‌شود. این مهلت فقط برای بی‌فعالیتی هنگام حضور روی خود سایت است؛ فعالیت یا پخش رسانه شمارش را ادامه می‌دهد.",
  ],
  scopeHelp: [
    "“Only the website using this profile” blocks the site that triggered the break. “All ordinary websites” blocks ordinary HTTP(S) sites until that break is complete. Browser-internal pages are excluded.",
    "گزینه «فقط سایتی که این پروفایل را دارد» همان سایت آغازکننده استراحت را قفل می‌کند. گزینه «همه سایت‌های عادی» تا پایان آن استراحت، سایت‌های HTTP(S) را قفل می‌کند؛ صفحات داخلی مرورگر خارج از پوشش‌اند.",
  ],
  everyHelp: [
    "Start a break after this many minutes of active use. Enter 0 to turn scheduled breaks off.",
    "پس از این تعداد دقیقه مصرف فعال، استراحت شروع می‌شود. صفر یعنی استراحت زمان‌بندی‌شده خاموش باشد.",
  ],
  durationHelp: [
    "The minimum rest time before continuing. Early exit is available only when skipping is enabled.",
    "حداقل زمان استراحت پیش از ادامه؛ خروج زودتر فقط با فعال‌بودن گزینه پرش ممکن است.",
  ],
  requiredFieldHelp: [
    "When enabled, checkboxes appear only after the timer and all must be checked. Otherwise they are available throughout the break and optional.",
    "در حالت اجباری چک‌باکس‌ها پس از پایان زمان ظاهر می‌شوند و همه باید تأیید شوند. در حالت اختیاری از ابتدا فعال‌اند و تأییدشان الزامی نیست.",
  ],
  profileHelp: [
    "Reuse a routine from Break profiles, choose no scheduled breaks, or create a new profile without leaving this website form.",
    "یک برنامه از بخش پروفایل استراحت انتخاب کنید، استراحت را خاموش کنید یا بدون ترک فرم سایت، پروفایل جدید بسازید.",
  ],
  mediaHelp: [
    "Count HTML audio/video playback even when its tab is not selected. Foreground media is always counted while playing.",
    "پخش صوت یا ویدئوی HTML حتی در تب پس‌زمینه محاسبه شود. رسانه در تب فعال هنگام پخش همیشه محاسبه می‌شود.",
  ],
  reminderHelp: [
    "Show a short on-page message at this interval with today’s usage and remaining allowance.",
    "با این فاصله زمانی، پیامی روی صفحه درباره مصرف امروز و سهمیه باقی‌مانده نشان داده می‌شود.",
  ],
  budgetHelp: [
    "How many minutes this website may be used in each daily or first-use window. Paused usage is recorded separately and does not consume the allowance.",
    "چند دقیقه در هر روز یا بازه از اولین استفاده می‌توانید از سایت استفاده کنید. مصرف هنگام وقفه ثبت می‌شود، ولی از سهمیه کم نمی‌شود.",
  ],
  resetHelp: [
    "Daily resets at local midnight. First-use windows begin when active usage starts and reset after the chosen number of hours.",
    "حالت روزانه در نیمه‌شب محلی بازنشانی می‌شود. بازه از اولین استفاده با آغاز مصرف فعال شروع و پس از ساعت‌های تعیین‌شده بازنشانی می‌شود.",
  ],
  windowHelp: [
    "Length of a first-use allowance window, in hours. This field is not used for daily allowances.",
    "طول بازه سهمیه از اولین استفاده بر حسب ساعت؛ در حالت روزانه استفاده نمی‌شود.",
  ],
  modeHelp: [
    "A time limit permits browsing up to the allowance. Always blocked prevents access and cannot be overridden by a temporary pause.",
    "محدودیت زمانی تا سقف سهمیه اجازه استفاده می‌دهد. مسدودی دائمی دسترسی را می‌بندد و با وقفه موقت باز نمی‌شود.",
  ],
  domainHelp: [
    "Enter domains or URLs, one per line. New website rules also cover subdomains.",
    "دامنه یا آدرس سایت را وارد کنید؛ هر خط یک سایت. قوانین سایت، زیردامنه‌های آن را هم پوشش می‌دهند.",
  ],
  checklistHelp: [
    "Write the activities to remember during a break, one per line. Required profiles need at least one item.",
    "فعالیت‌های یادآوری استراحت را هرکدام در یک خط بنویسید. پروفایل اجباری باید دست‌کم یک مورد داشته باشد.",
  ],
  reportScopeHelp: [
    "Choose whether to record only websites with rules or all visited ordinary websites. Reports stay on this device.",
    "فقط سایت‌های دارای قانون یا همه سایت‌های عادی بازدیدشده را ثبت کنید. گزارش‌ها روی همین دستگاه می‌مانند.",
  ],
  retentionHelp: [
    "Older usage and break activity records are removed after this many local calendar days.",
    "گزارش مصرف و فعالیت استراحت قدیمی‌تر از این تعداد روز تقویمی محلی حذف می‌شود.",
  ],
  pauseMaxHelp: [
    "Maximum number of temporary quota exceptions per local calendar day, shared by all websites. It does not reset every few-hour window. Enter 0 for no exceptions.",
    "حداکثر دفعات وقفه سهمیه در هر روز تقویمی محلی، مشترک بین همه سایت‌ها. با بازه چندساعته دوباره شارژ نمی‌شود. صفر یعنی بدون وقفه.",
  ],
  pinHelp: [
    "Exactly four digits. The PIN protects settings and temporary quota pauses.",
    "دقیقاً چهار رقم؛ پین از تنظیمات و وقفه موقت سهمیه محافظت می‌کند.",
  ],
  nameHelp: [
    "Give this reusable break routine a name you will recognize in website settings.",
    "برای برنامه استراحت نامی انتخاب کنید که در تنظیمات سایت‌ها قابل تشخیص باشد.",
  ],
  rangeHelp: [
    "Choose the first and last local calendar dates to include in the report.",
    "اولین و آخرین روز تقویمی محلی برای گزارش را انتخاب کنید.",
  ],
  languageHelp: [
    "Change menu language and layout direction.",
    "زبان منو و جهت چیدمان را تغییر دهید.",
  ],
} as const;
export type UxKey = keyof typeof copy;
export function ux(key: UxKey, language: Language): string {
  return copy[key][language === "fa" ? 1 : 0];
}
