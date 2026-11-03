// Opt out of tracking on non-canonical urls (a local preview, a fork's Pages site).
// A classic script, so it runs before the deferred Umami script reads the flag.
if (window.location.hostname !== "agrmohit.com") localStorage.setItem("umami.disabled", "1");
