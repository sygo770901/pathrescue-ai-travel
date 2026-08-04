import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <p className="text-sm font-medium tracking-[0.18em] text-[var(--sea)] uppercase">
        PathRescue
      </p>
      <h1 className="font-display mt-3 text-4xl text-[var(--ink)]">目前離線中</h1>
      <p className="mt-3 text-[var(--ink-soft)]">
        無法連線時，仍可從主畫面開啟 App，並查看先前已快取的行程資料。
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex w-fit rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-medium text-[var(--paper)]"
      >
        回到首頁（使用快取）
      </Link>
    </main>
  );
}
