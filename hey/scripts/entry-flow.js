(function (Hey) {
  function animateFooterChange(newText, callback) {
    const footer = document.querySelector(".footer-text");
    footer.classList.add("fade-out");

    setTimeout(() => {
      footer.innerHTML = newText;
      footer.classList.remove("fade-out");
      if (callback) callback();
    }, 400);
  }

  Hey.enterGames = function (clickedByUser = false) {
    const STR = Hey.state.STR;
    Hey.state.userClicked = clickedByUser;

    // Disable the button
    const button = document.getElementById("entryButton");
    button.disabled = true;
    button.style.opacity = "0.5";
    button.style.cursor = "not-allowed";
    button.textContent = STR.entryButton.starting;

    if (Hey.state.userClicked) {
      // User clicked sequence
      animateFooterChange(STR.footer.perfectTiming, () => {
        setTimeout(() => {
          animateFooterChange(STR.footer.letsGetStarted, () => {
            setTimeout(() => {
              Hey.showCountdown();
            }, 2500);
          });
        }, 2000);
      });
    } else {
      // Auto-redirect sequence
      animateFooterChange(STR.footer.notThatMuchTime, () => {
        setTimeout(() => {
          animateFooterChange(STR.footer.illRedirectYou, () => {
            setTimeout(() => {
              Hey.showCountdown();
            }, 2500);
          });
        }, 3500);
      });
    }
  };

  Hey.abortRedirect = function () {
    const STR = Hey.state.STR;
    Hey.state.redirectAborted = true;
    clearInterval(Hey.state.countdownTimer);

    const countdown = document.getElementById("countdown");
    countdown.classList.remove("show");

    // Re-enable the begin button
    const button = document.getElementById("entryButton");
    button.disabled = false;
    button.style.opacity = "1";
    button.style.cursor = "pointer";
    button.textContent = STR.entryButton.default;

    // Reset timer
    Hey.state.timeLeft = 5;

    animateFooterChange(STR.footer.aborted);
  };

  Hey.showCountdown = function () {
    if (Hey.state.redirectAborted) return;

    const countdown = document.getElementById("countdown");
    countdown.classList.add("show");

    // Start countdown
    Hey.state.countdownTimer = setInterval(() => {
      if (Hey.state.redirectAborted) {
        clearInterval(Hey.state.countdownTimer);
        return;
      }

      Hey.state.timeLeft--;
      document.getElementById("timer").textContent = Hey.state.timeLeft;

      if (Hey.state.timeLeft <= 0) {
        clearInterval(Hey.state.countdownTimer);
        if (!Hey.state.redirectAborted) {
          window.location.href = Hey.randomGameUrl();
        }
      }
    }, 1000);
  };
})(window.Hey);
