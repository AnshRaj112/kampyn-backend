module.exports = (function() {
  const lines = [
    "     ___  __    ________  _____ ______   ________  ___    ___ ________      ",
    "    |\\  |\\  \\ |\\   __  \\|\\   _ \\  _   \\|\\   __  \\|\\  \\  /  /|\\   ___  \\    ",
    "    \\ \\  \\/  /|\\ \\  |\\  \\ \\  \\\\\\__\\ \\  \\ \\  |\\  \\ \\  \\/  / | \\  \\\\ \\  \\   ",
    "     \\ \\   ___  \\ \\   __  \\ \\  \\\\|__| \\  \\ \\   ____\\ \\    / / \\ \\  \\\\ \\  \\  ",
    "      \\ \\  \\\\ \\  \\ \\  \\ \\  \\ \\  \\    \\ \\  \\ \\  \\___|\\/  /  /   \\ \\  \\\\ \\  \\ ",
    "       \\ \\__\\\\ \\__\\ \\__\\ \\__\\ \\__\\    \\ \\__\\ \\__\\ __/  / /      \\ \\__\\\\ \\__\\ ",
    "        \\|__| \\|__|\\|__|\\|__|\\|__|     \\|__|\\|__|\\|___/ /        \\|__| \\|__| ",
    "                                                 \\|___|/                      "
  ];

  let output = "\n";
  
  // Sunset Gradient for Backend: Orange (#f97316) to Rose (#e11d48)
  const r1 = 249, g1 = 115, b1 = 22;
  const r2 = 225, g2 = 29, b2 = 72;

  lines.forEach((line) => {
    let coloredLine = "";
    for (let x = 0; x < line.length; x++) {
      const char = line[x];
      if (char === " ") {
        coloredLine += " ";
        continue;
      }
      
      const ratio = x / 95;
      const r = Math.round(r1 + (r2 - r1) * ratio);
      const g = Math.round(g1 + (g2 - g1) * ratio);
      const b = Math.round(b1 + (b2 - b1) * ratio);
      
      coloredLine += "\x1b[38;2;" + r + ";" + g + ";" + b + "m" + char + "\x1b[0m";
    }
    output += coloredLine + "\n";
  });
  
  return output.trimEnd() + "\n";
})();
