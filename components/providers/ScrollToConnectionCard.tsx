"use client";

/**
 * Button that scrolls to the ConnectionCard sidebar and briefly highlights it.
 * On mobile (< md), opens the ConnectionCard bottom sheet instead since the
 * sidebar is hidden.
 *
 * Used by "Get a custom quote", "Book a consultation", and "Connect with us".
 */
export default function ScrollToConnectionCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  function handleClick() {
    // On mobile (< md breakpoint), the sidebar is hidden — open bottom sheet instead
    if (window.innerWidth < 768) {
      window.dispatchEvent(new CustomEvent("open-connection-sheet"));
      return;
    }

    // Desktop: scroll to sidebar card and highlight
    const el = document.getElementById("connection-card");
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "start" });

    // Add highlight pulse
    el.classList.add("ring-2", "ring-primary-400", "ring-offset-2", "rounded-2xl");
    setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary-400", "ring-offset-2", "rounded-2xl");
    }, 2000);
  }

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
