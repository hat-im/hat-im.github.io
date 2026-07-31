(function (Hey) {
  Hey.checkForReturnVisitor = function () {
    // Check if user has visited before
    const hasVisitedBefore = localStorage.getItem("hey_page_visited") === "true";

    if (hasVisitedBefore) {
      // Show welcome back message
      Hey.showWelcomeBackMessage();
    }

    // Mark this visit
    localStorage.setItem("hey_page_visited", "true");
  };

  Hey.showWelcomeBackMessage = async function () {
    const surpriseMessage = document.getElementById("surpriseMessage");
    const steps = Hey.state.STR.surprise.welcomeBack.steps;
    const token = Hey.beginSurpriseSequence();

    surpriseMessage.innerHTML = "";
    surpriseMessage.classList.add("typing", "show");

    await Hey.runTypewriterSequence(surpriseMessage, steps, token);

    if (token.cancelled) return;

    surpriseMessage.classList.remove("typing");

    const endedOnDelete = steps.length > 0 && steps[steps.length - 1].action === "delete";
    if (endedOnDelete) {
      surpriseMessage.classList.remove("show");
      surpriseMessage.innerHTML = "";
    }
  };

  // Scratch-off functionality
  Hey.toggleScratchItem = function (item) {
    if (!item.classList.contains("scratched-off")) {
      item.classList.add("scratched-off");
    } else {
      item.classList.remove("scratched-off");
    }
    Hey.checkAllItemsCompleted();
  };

  Hey.checkAllItemsCompleted = function () {
    const items = document.querySelectorAll(".instruction-item");
    const scratchedItems = document.querySelectorAll(".instruction-item.scratched-off");

    if (scratchedItems.length === items.length) {
      Hey.startTypingMessage();
    } else {
      Hey.cancelSurpriseSequence();
      const surpriseMessage = document.getElementById("surpriseMessage");
      surpriseMessage.classList.remove("show", "typing");
      surpriseMessage.innerHTML = "";
      const button = document.getElementById("entryButton");
      button.textContent = Hey.state.STR.entryButton.ready;
    }
  };

  Hey.startTypingMessage = async function () {
    const surpriseMessage = document.getElementById("surpriseMessage");
    const steps = Hey.state.STR.surprise.letsGo.steps;
    const token = Hey.beginSurpriseSequence();

    surpriseMessage.innerHTML = "";
    surpriseMessage.classList.add("typing", "show");

    await Hey.runTypewriterSequence(surpriseMessage, steps, token);

    if (token.cancelled) return;

    surpriseMessage.classList.remove("typing");

    const endedOnDelete = steps.length > 0 && steps[steps.length - 1].action === "delete";
    if (endedOnDelete) {
      surpriseMessage.classList.remove("show");
      surpriseMessage.innerHTML = "";
    }

    setTimeout(() => {
      const button = document.getElementById("entryButton");
      button.textContent = Hey.state.STR.entryButton.excited;
    }, 200);
  };
})(window.Hey);
