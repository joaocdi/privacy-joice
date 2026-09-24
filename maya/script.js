// =====================================================
//  LINKS DA MAYA — edite apenas aqui
//  Use URLs completas começando com https://
//  Enquanto estiver "", o botão aparece mas não abre nada.
// =====================================================
const links = {
  telegram: "https://t.me/mayavl_vip",
  privacy: "https://maya.ofc.bio/"
};

// -----------------------------------------------------
(function () {
  "use strict";

  function isValid(url) {
    return typeof url === "string" && /^https:\/\/\S+$/i.test(url.trim());
  }

  document.querySelectorAll("[data-link]").forEach(function (btn) {
    var url = links[btn.getAttribute("data-link")];

    if (isValid(url)) {
      btn.setAttribute("href", url.trim());
      btn.removeAttribute("aria-disabled");
    } else {
      // sem link configurado: o botão aparece, mas não abre nada
      btn.removeAttribute("href");
      btn.setAttribute("role", "link");
      btn.setAttribute("aria-disabled", "true");
      btn.addEventListener("click", function (e) { e.preventDefault(); });
    }
  });
})();
