(function () {
  "use strict";

  var GLYPH_CAPTIONS = {
    heart: "Heart",
    star: "Star",
    plane: "Paper airplane",
    club: "Club (card suit)",
    stripe: "Airmail stripe border",
    crosshatch: "Crosshatch cancel texture",
    cup: "Coffee cup — Bangalore",
    pawprint: "Tiger paw print — Bengal",
    bigben: "Clock tower — London",
    cat: "Cat face",
    "cat-sitting": "Cat, sitting",
    puppy: "Puppy",
    tube: "London Underground",
    phonebooth: "Telephone booth — London",
    bus: "Double-decker bus — London",
    waves: "Waves"
  };

  var SEAL_CAPTIONS = {
    cds: "Circular Date Stamp",
    wavyLines: "Machine wavy-line cancel",
    sloganCancel: "Slogan cancel box",
    geometricTarget: "Geometric target / bullseye",
    fancyPictorial: "Fancy pictorial cancel",
    imbBarcode: "Intelligent Mail Barcode",
    inkjetSpray: "Inkjet spray cancel",
    permitIndicia: "Postal permit indicia",
    fim: "Facing Identification Mark",
    ibi2d: "2D data-matrix (IBI)",
    parsSticker: "PARS forwarding sticker",
    nixieLabel: "Nixie undeliverable label",
    fluorescentBarcode: "Fluorescent back-barcode",
    trackingBarcode: "Tracking barcode",
    serviceRequested: "Service-requested endorsement"
  };

  function makeItem(grid, width, height) {
    var item = document.createElement("div");
    item.className = "item";
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    item.appendChild(canvas);
    grid.appendChild(item);
    return { item: item, ctx: canvas.getContext("2d") };
  }

  function addLabels(item, id, caption) {
    var idEl = document.createElement("div");
    idEl.className = "id";
    idEl.textContent = id;
    item.appendChild(idEl);
    var capEl = document.createElement("div");
    capEl.className = "caption";
    capEl.textContent = caption || "";
    item.appendChild(capEl);
  }

  function renderGlyphs() {
    var grid = document.getElementById("glyphGrid");
    Object.keys(PostcardEngine.GLYPHS).forEach(function (id) {
      var slot = makeItem(grid, 110, 110);
      PostcardEngine.drawGlyph(slot.ctx, id, 55, 55, 35, "#3a3a44", 0);
      addLabels(slot.item, id, GLYPH_CAPTIONS[id]);
    });
  }

  function renderSeals() {
    var grid = document.getElementById("sealGrid");
    PostcardEngine.SEALS.forEach(function (type) {
      var slot = makeItem(grid, 220, 120);
      var rng = HashUtils.hashSeed(type);
      var extras = PostcardEngine.buildSealExtras(type, rng, PostcardEngine.SEAL_COPY, "Sep 12, 2026");
      var seal = Object.assign({ type: type, x: 110, y: 60, rotation: 0 }, extras);
      PostcardEngine.drawSeal(slot.ctx, seal);
      addLabels(slot.item, type, SEAL_CAPTIONS[type]);
    });
  }

  function renderStamps() {
    var grid = document.getElementById("stampGrid");
    PostcardEngine.STAMPS.forEach(function (img, i) {
      var slot = makeItem(grid, 110, 140);
      slot.ctx.save();
      slot.ctx.shadowColor = "rgba(0,0,0,0.25)";
      slot.ctx.shadowBlur = 6;
      slot.ctx.shadowOffsetY = 2;
      var scale = Math.min(94 / img.naturalWidth, 124 / img.naturalHeight);
      var dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      slot.ctx.drawImage(img, (110 - dw) / 2, (140 - dh) / 2, dw, dh);
      slot.ctx.restore();
      addLabels(slot.item, "stamp-" + (i + 1), "");
    });
  }

  PostcardEngine.init().then(function () {
    renderGlyphs();
    renderSeals();
    renderStamps();
  });
})();
