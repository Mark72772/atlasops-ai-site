(function () {
  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function termsFor(value) {
    const normalized = normalize(value);
    if (!normalized || normalized === "all") return [];
    return normalized.split(/\s+/).filter(Boolean);
  }

  function itemText(item) {
    return normalize([item.dataset.tags, item.textContent].join(" "));
  }

  function applyFilter(rawValue) {
    const terms = termsFor(rawValue);
    const items = Array.from(document.querySelectorAll("[data-marketplace-item]"));
    items.forEach((item) => {
      const text = itemText(item);
      const visible = terms.length === 0 || terms.every((term) => text.includes(term));
      item.classList.toggle("is-filter-hidden", !visible);
    });
  }

  function bindMarketplaceFilters() {
    const search = document.getElementById("marketplace-search");
    const buttons = Array.from(document.querySelectorAll("[data-filter-value]"));
    if (search) {
      search.addEventListener("input", () => {
        buttons.forEach((button) => button.classList.remove("is-active"));
        applyFilter(search.value);
      });
    }
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        buttons.forEach((candidate) => candidate.classList.remove("is-active"));
        button.classList.add("is-active");
        if (search) search.value = button.dataset.filterValue === "all" ? "" : button.textContent.trim();
        applyFilter(button.dataset.filterValue);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", bindMarketplaceFilters);
})();
