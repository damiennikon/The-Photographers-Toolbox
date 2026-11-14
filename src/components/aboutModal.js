import toolboxLogo from "../assets/toolbox-logo.webp";

export function openAbout() {
  const dialog = document.createElement("dialog");
  dialog.className = "pt-modal pt-app-dialog";
  dialog.setAttribute("aria-labelledby", "about-title");
  dialog.innerHTML = `
    <h2 class="pt-modal-title" id="about-title">About</h2>
    <img class="pt-about-logo" src="${toolboxLogo}" width="1320" height="760" alt="Photographer's Toolbox" />
    <div class="pt-field pt-field-stack pt-app-dialog-content">
      <p>Plan photography and astrophotography shoots with the Photographer’s Toolbox. Find sunrise, golden hour, and Milky Way times, save your favourite spots and shoot plans, and calculate long exposures with the ND Filter &amp; Timer.</p>
      <p>Your saved locations and shoot plans are stored on this device. After an online visit, saved plans and built-in calculators can be used offline. Map tiles, online search, and linked tools may need internet access.</p>
      <a href="https://github.com/damiennikon/The-Photographers-Toolbox" target="_blank" rel="noopener noreferrer">View project on GitHub</a>
    </div>
    <form method="dialog">
      <button class="pt-modal-close" autofocus>Close</button>
    </form>`;

  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}
