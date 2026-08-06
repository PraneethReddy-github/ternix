<!--
Edit this before tagging a release. It becomes the GitHub release body and is what users
see in Settings → Updates as "What's new". Short bullets only — this comment is not shown.
-->

**📱 Mobile Touch & Phone Access Improvements**
- **Fluid Mobile Touch Scrolling:** Overhauled the Phone Access touch scrolling engine with kinetic momentum flinging (`requestAnimationFrame`) and zero-latency touch response.
- **Eliminated Scroll Lock:** Fixed an issue where diagonal touch gestures on mobile browsers (Safari & Chrome) would lock out vertical terminal scrolling or cause stiff/hard scrolling.
- **Redesigned Jump-to-Latest Button:** Pinned the scroll-to-bottom (`↓`) arrow seamlessly into the mobile key bar with matching toolbar background styling (`var(--surface2)`). It now fills the bar height cleanly and disappears completely when viewing the latest output without leaving nested box borders or spacing.

**🛠️ Security & Bug Fixes**
- **Touch Gesture Protection:** Applied `touch-action: none` on mobile terminal viewports to eliminate browser overscroll and gesture conflicts on iOS Safari and Android Chrome.
- **Real-Time Scroll Sync:** Streaming terminal output now dynamically updates scrollback affordances and jump-button visibility in real time.
