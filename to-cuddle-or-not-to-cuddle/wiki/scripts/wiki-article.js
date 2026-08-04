(function () {
  var slug = window.WIKI_SLUG;
  if (!slug) return;

  var DATA_URL = "data/" + slug + ".json";
  var CONTENT_URL = "content/" + slug + ".md";

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Minimal markdown: paragraphs (blank-line separated), ## headings,
  // **bold**, *italic*, and [text](url) links — the only syntax the mock
  // wiki articles actually use, so no full markdown library is pulled in.
  function renderInline(text) {
    text = escapeHtml(text);
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (match, label, href) {
      return '<a href="' + href + '" target="_blank" rel="noopener">' + label + "</a>";
    });
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return text;
  }

  function renderMarkdown(markdown) {
    return markdown
      .trim()
      .split(/\n\s*\n/)
      .map(function (block) {
        var heading = block.match(/^##\s+(.*)$/);
        if (heading) return "<h2>" + renderInline(heading[1]) + "</h2>";
        return "<p>" + renderInline(block.replace(/\s*\n\s*/g, " ")) + "</p>";
      })
      .join("\n");
  }

  function renderInfobox(data) {
    var html = '<div class="infobox-title">' + escapeHtml(data.title) + "</div>";

    if (data.image) {
      html += '<img src="' + data.image + '" alt="' + escapeHtml(data.imageAlt || "") + '" />';
    }
    if (data.imageCaption) {
      html += '<div class="infobox-caption">' + escapeHtml(data.imageCaption) + "</div>";
    }

    html += "<table>";
    data.infobox.forEach(function (section) {
      html +=
        '<tr class="section-row"><td colspan="2">' + escapeHtml(section.section) + "</td></tr>";

      section.rows.forEach(function (row) {
        var value = escapeHtml(row.value);
        if (row.italic) value = "<em>" + value + "</em>";
        var cellClass = row.class ? ' class="' + row.class + '"' : "";
        html +=
          "<tr><td class=\"label\">" +
          escapeHtml(row.label) +
          "</td><td" +
          cellClass +
          ">" +
          value +
          "</td></tr>";
      });
    });
    html += "</table>";

    document.getElementById("infobox").innerHTML = html;
  }

  function renderCategories(categories) {
    if (!categories || !categories.length) return;

    var el = document.createElement("div");
    el.className = "categories";

    categories.forEach(function (cat) {
      var a = document.createElement("a");
      a.href = cat.href;
      a.textContent = cat.label;
      el.appendChild(a);
    });

    document.getElementById("article").appendChild(el);
  }

  Promise.all([
    fetch(DATA_URL).then(function (res) {
      return res.json();
    }),
    fetch(CONTENT_URL).then(function (res) {
      return res.text();
    }),
  ])
    .then(function (results) {
      var data = results[0];
      var markdown = results[1];

      document.title = data.pageTitle || data.title;
      document.getElementById("tagline").textContent =
        data.tagline || "From Wikipedia, the free-ish encyclopedia";
      document.getElementById("pageTitle").textContent = data.title;
      document.getElementById("article").innerHTML = renderMarkdown(markdown);

      renderInfobox(data);
      renderCategories(data.categories);
    })
    .catch(function (err) {
      console.error("Failed to load wiki article", err);
    });
})();
