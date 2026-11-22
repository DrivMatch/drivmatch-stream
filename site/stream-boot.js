/* DrivMatch Stream: ES5-safe browser selector. No PIN/password in client code. */
(function () {
  "use strict";
  var ua = navigator.userAgent || "";
  var tv = /SMART-TV|SmartTV|Tizen|TV Safari|NetCast|Web0S|WebOS/i.test(ua);
  if (tv) { window.location.replace('/stream/tv/'); return; }
  var modern = !tv &&
    typeof window.fetch === "function" &&
    typeof window.Promise === "function" &&
    typeof window.Promise.allSettled === "function" &&
    typeof window.Map === "function" &&
    typeof window.Set === "function" &&
    typeof window.URL === "function" &&
    typeof String.prototype.normalize === "function";
  var script = document.createElement("script");
  script.src = modern ? "./stream.js" : "./stream-tv.js";
  script.async = false;
  script.onerror = function () {
    var message = document.getElementById("gate-message");
    if (message) {
      message.innerHTML = "";
      message.appendChild(document.createTextNode(
        "Não foi possível carregar a interface nesta TV. Atualize a página ou teste outro navegador."));
    }
  };
  document.getElementsByTagName("head")[0].appendChild(script);
}());
