const options = document.querySelector<HTMLElement>(".start-options");

if (options) {
  const choices = options.querySelectorAll<HTMLElement>("[data-choice]");

  const setActiveChoice = (choice?: string) => {
    if (!choice) {
      delete options.dataset.activeChoice;
      options.classList.remove("has-active-choice");
      return;
    }

    options.dataset.activeChoice = choice;
    options.classList.add("has-active-choice");
  };

  choices.forEach((choice) => {
    const choiceName = choice.dataset.choice;
    choice.addEventListener("pointerenter", () => setActiveChoice(choiceName));
    choice.addEventListener("focusin", () => setActiveChoice(choiceName));
    choice.addEventListener("focusout", (event) => {
      if (!choice.contains(event.relatedTarget as Node | null)) setActiveChoice();
    });
  });

  options.addEventListener("pointerleave", () => setActiveChoice());
}
