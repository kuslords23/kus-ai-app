/**
 * Floating “Back to Royal” button for the Kus-lords Hub.
 * Hub should include: <script src="https://kus-ai-app.vercel.app/hub-return-badge.js" defer></script>
 * Or load when URL has ?companion=kus-ai or ?returnTo=
 */
(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    var returnTo =
      params.get("returnTo") ||
      (params.get("companion") === "kus-ai"
        ? "https://kus-ai-app.vercel.app"
        : null);
    if (!returnTo || document.getElementById("kus-ai-return-fab")) return;

    var link = document.createElement("a");
    link.id = "kus-ai-return-fab";
    link.href = returnTo;
    link.textContent = "← Royal";
    link.title = "Back to Royal AI companion";
    link.setAttribute("aria-label", "Back to Royal AI companion");
    link.style.cssText =
      "position:fixed;bottom:calc(12px + env(safe-area-inset-bottom,0px));right:12px;z-index:2147483647;" +
      "padding:10px 16px;border-radius:999px;" +
      "background:linear-gradient(135deg,#d4af37,#9a7b1a);color:#0c0a14;" +
      "font:600 13px system-ui,-apple-system,sans-serif;text-decoration:none;" +
      "box-shadow:0 4px 24px rgba(0,0,0,.5);opacity:0.94;" +
      "transition:opacity .2s ease,transform .2s ease;";

    link.addEventListener("mouseenter", function () {
      link.style.opacity = "1";
      link.style.transform = "scale(1.05)";
    });
    link.addEventListener("mouseleave", function () {
      link.style.opacity = "0.94";
      link.style.transform = "scale(1)";
    });

    document.body.appendChild(link);
  } catch (e) {
    /* ignore */
  }
})();
