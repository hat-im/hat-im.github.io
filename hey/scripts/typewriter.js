(function (Hey) {
  // Only one typewriter sequence may animate a given element at a time.
  // Starting a new one cancels whatever stage the previous one was in.
  Hey.cancelSurpriseSequence = function () {
    if (Hey.state.currentSurpriseToken) {
      Hey.state.currentSurpriseToken.cancelled = true;
    }
  };

  Hey.beginSurpriseSequence = function () {
    Hey.cancelSurpriseSequence();
    const token = { cancelled: false };
    Hey.state.currentSurpriseToken = token;
    return token;
  };

  // Runs a declarative sequence of { action: "type" | "delete" | "pause", ... }
  // steps against element.innerHTML, e.g. STR.surprise.welcomeBack.steps.
  // Stops immediately, without touching the DOM further, once token.cancelled.
  Hey.runTypewriterSequence = async function (element, steps, token) {
    let buffer = "";

    for (const step of steps) {
      if (token.cancelled) return;

      if (step.action === "type") {
        for (const char of step.text) {
          if (token.cancelled) return;
          buffer += char;
          element.innerHTML = buffer + '<span class="typing-cursor">|</span>';
          await Hey.wait(step.speed);
        }
      } else if (step.action === "delete") {
        const targetLength =
          typeof step.chars === "number" ? Math.max(0, buffer.length - step.chars) : 0;
        while (buffer.length > targetLength) {
          if (token.cancelled) return;
          buffer = buffer.slice(0, -1);
          element.innerHTML = buffer + '<span class="typing-cursor">|</span>';
          await Hey.wait(step.speed);
        }
      } else if (step.action === "pause") {
        await Hey.wait(step.duration);
      }
    }

    if (token.cancelled) return;
    element.innerHTML = buffer;
  };
})(window.Hey);
