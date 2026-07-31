(function (DJ) {
  DJ.showModal = function () {
    document.getElementById("modalSetup").textContent = DJ.state.joke.setup;
    document.getElementById("modalPunchline").textContent = DJ.state.joke.punchline;
    document.getElementById("modalOverlay").classList.add("show");
  };

  DJ.hideModal = function () {
    document.getElementById("modalOverlay").classList.remove("show");
  };

  // Loads a fresh joke: pick one unseen this tab session, reset the drawing
  // area, retype the new setup. Shared by the modal's "next" button and the
  // standalone "Next" link that appears once they've gone back to view a
  // finished drawing.
  function loadNextJoke() {
    document.getElementById("nextLink").classList.remove("show");
    DJ.pickNextJoke();
    DJ.state.nextIndex = 0;
    DJ.typeSetup();
    DJ.renderDots();
    DJ.checkAutoComplete();
  }

  DJ.bindModalEvents = function () {
    var backButton = document.getElementById("modalBackButton");
    var nextButton = document.getElementById("modalNextButton");
    var nextLink = document.getElementById("nextLink");

    backButton.textContent = DJ.state.STR.modal.backButton;
    nextButton.textContent = DJ.state.STR.modal.nextButton;

    // "Back" dismisses the modal to view the finished drawing, and surfaces
    // a "Next" link near the setup text as the way to move on from here.
    backButton.addEventListener("click", function () {
      DJ.hideModal();
      DJ.renderNextLink();
      nextLink.classList.add("show");
    });

    nextButton.addEventListener("click", function () {
      DJ.hideModal();
      loadNextJoke();
    });

    nextLink.addEventListener("click", function (e) {
      e.preventDefault();
      loadNextJoke();
    });
  };
})(window.DadJokes);
