import { icon } from "../icons.js";
import { getTool } from "../tools.config.js";

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export function fieldToolPage(id, content) {
  const tool = getTool(id);
  return `
    <div class="pt-tool-view">
      <header class="pt-tool-topbar">
        <a class="pt-tool-back pt-field-back" href="#/" aria-label="Back to toolbox">
          ${icon("arrowLeft")} <span class="pt-tool-back-label">Toolbox</span>
        </a>
        <div class="pt-tool-current">
          ${icon(tool.icon, "pt-tool-current-icon")}
          <span class="pt-tool-title">${tool.name}</span>
        </div>
      </header>
      <div class="pt-planner-scroll"><div class="pt-planner pt-field">${content}</div></div>
    </div>`;
}

export function downloadFile(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
