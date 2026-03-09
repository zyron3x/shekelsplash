/* Lottery Ball Particle System — Canvas-based physics emitter */

(function () {
  "use strict";

  var canvas, ctx, balls, raf;
  var W, H;
  // Emitter point — fingertips position (relative to the image, not viewport)
  // Salt Bae image (2546x1080): fingertips at roughly 35% from left, 6% from top
  var IMG_FINGER_X_PCT = 0.35;
  var IMG_FINGER_Y_PCT = 0.06;
  var IMG_NATURAL_W = 2546;
  var IMG_NATURAL_H = 1080;

  // Compute emitter position accounting for object-fit: cover
  // with object-position: center top
  function getEmitterPos() {
    var imgAspect = IMG_NATURAL_W / IMG_NATURAL_H;
    var containerAspect = W / H;
    var renderW, renderH, offsetX, offsetY;

    if (containerAspect > imgAspect) {
      // Container wider than image aspect — width-fills, height overflows
      renderW = W;
      renderH = W / imgAspect;
      offsetX = 0;
      offsetY = 0; // top-aligned
    } else {
      // Container taller than image aspect — height-fills, width overflows
      renderH = H;
      renderW = H * imgAspect;
      offsetX = (W - renderW) / 2; // centered horizontally
      offsetY = 0; // top-aligned
    }

    return {
      x: offsetX + renderW * IMG_FINGER_X_PCT,
      y: offsetY + renderH * IMG_FINGER_Y_PCT
    };
  }
  var GRAVITY = 0.12;
  var SPAWN_RATE = 600; // ms between spawns (slower generation)
  var MAX_BALLS = 10;
  var BALL_RADIUS_MIN = 14;
  var BALL_RADIUS_MAX = 22;
  var BALL_LIFETIME = 6000; // ms

  // Splash particles array
  var splashes = [];

  function SplashParticle(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = -(Math.random() * 3 + 1);
    this.radius = 2 + Math.random() * 3;
    this.color = color;
    this.opacity = 0.9;
    this.life = 0;
    this.maxLife = 300 + Math.random() * 200; // ms
    this.born = Date.now();
  }

  SplashParticle.prototype.update = function () {
    this.vy += 0.08;
    this.x += this.vx;
    this.y += this.vy;
    this.life = Date.now() - this.born;
    this.opacity = Math.max(0, 1 - this.life / this.maxLife);
    return this.life < this.maxLife;
  };

  SplashParticle.prototype.draw = function (context) {
    context.save();
    context.globalAlpha = this.opacity;
    context.beginPath();
    context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    context.fillStyle = this.color;
    context.fill();
    context.restore();
  };

  function spawnSplash(x, y, color) {
    var count = 5 + Math.floor(Math.random() * 4);
    for (var i = 0; i < count; i++) {
      splashes.push(new SplashParticle(x, y, color));
    }
  }

  // Gold gradient for main balls, purple for powerball
  var GOLD_COLORS = ["#E8B84B", "#D4A843", "#C99A35", "#F0C862"];
  var PURPLE_COLORS = ["#7717FF", "#6B14E6", "#844CF6", "#5A0FCC"];

  function Ball(x, y) {
    this.x = x;
    this.y = y;
    // Random spread from fingertips — fan downward and to the right with slight leftward too
    this.vx = (Math.random() - 0.3) * 3.5;
    this.vy = Math.random() * 1.5 + 0.5;
    this.radius = BALL_RADIUS_MIN + Math.random() * (BALL_RADIUS_MAX - BALL_RADIUS_MIN);
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.06;
    this.born = Date.now();
    this.opacity = 1;
    this.bounce = 0.4 + Math.random() * 0.2;

    // 5 main (gold) + 1 powerball (purple) out of every ~6
    var isPowerball = Math.random() < 0.17;
    this.isPowerball = isPowerball;

    if (isPowerball) {
      this.number = Math.floor(Math.random() * 18) + 1;
      this.bgColor = PURPLE_COLORS[Math.floor(Math.random() * PURPLE_COLORS.length)];
      this.textColor = "#FFFFFF";
    } else {
      this.number = Math.floor(Math.random() * 55) + 1;
      this.bgColor = GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)];
      this.textColor = "#1A0E35";
    }
  }

  Ball.prototype.update = function () {
    this.vy += GRAVITY;
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;

    // Bounce off bottom
    if (this.y + this.radius > H) {
      // Splash effect on first significant impact
      if (this.vy > 2 && !this.hasSplashed) {
        spawnSplash(this.x, H - 2, this.bgColor);
        this.hasSplashed = true;
      }
      this.y = H - this.radius;
      this.vy = -this.vy * this.bounce;
      this.vx *= 0.92;
      if (Math.abs(this.vy) < 0.5) {
        this.vy = 0;
      }
    }

    // Bounce off sides
    if (this.x - this.radius < 0) {
      this.x = this.radius;
      this.vx = Math.abs(this.vx) * this.bounce;
    }
    if (this.x + this.radius > W) {
      this.x = W - this.radius;
      this.vx = -Math.abs(this.vx) * this.bounce;
    }

    // Fade out near end of lifetime
    var age = Date.now() - this.born;
    if (age > BALL_LIFETIME * 0.7) {
      this.opacity = Math.max(0, 1 - (age - BALL_LIFETIME * 0.7) / (BALL_LIFETIME * 0.3));
    }

    return age < BALL_LIFETIME;
  };

  Ball.prototype.draw = function (context) {
    context.save();
    context.globalAlpha = this.opacity;
    context.translate(this.x, this.y);
    context.rotate(this.rotation);

    var r = this.radius;

    // Ball body with 3D gradient
    var grad = context.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);

    if (this.isPowerball) {
      grad.addColorStop(0, "#A97AFF");
      grad.addColorStop(0.5, this.bgColor);
      grad.addColorStop(1, "#3A0A8A");
    } else {
      grad.addColorStop(0, "#FFE49A");
      grad.addColorStop(0.4, this.bgColor);
      grad.addColorStop(1, "#8A6A1A");
    }

    context.beginPath();
    context.arc(0, 0, r, 0, Math.PI * 2);
    context.fillStyle = grad;
    context.fill();

    // Glossy highlight
    var highlight = context.createRadialGradient(-r * 0.25, -r * 0.35, 0, -r * 0.25, -r * 0.35, r * 0.6);
    highlight.addColorStop(0, "rgba(255,255,255,0.5)");
    highlight.addColorStop(1, "rgba(255,255,255,0)");
    context.beginPath();
    context.arc(0, 0, r, 0, Math.PI * 2);
    context.fillStyle = highlight;
    context.fill();

    // Subtle border ring
    context.beginPath();
    context.arc(0, 0, r - 1, 0, Math.PI * 2);
    context.strokeStyle = this.isPowerball ? "rgba(160,120,255,0.4)" : "rgba(180,150,60,0.5)";
    context.lineWidth = 1.5;
    context.stroke();

    // Number text (counter-rotate so text is always upright)
    context.rotate(-this.rotation);
    context.font = "bold " + Math.round(r * 0.85) + "px 'Clash Display', 'Satoshi', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";

    // Text shadow
    context.fillStyle = "rgba(0,0,0,0.3)";
    context.fillText(this.number, 1, 1.5);

    context.fillStyle = this.textColor;
    context.fillText(this.number, 0, 0.5);

    context.restore();
  };

  function resize() {
    var hero = document.querySelector(".hero");
    if (!hero || !canvas) return;
    W = hero.offsetWidth;
    H = hero.offsetHeight;
    canvas.width = W;
    canvas.height = H;
  }

  var lastSpawn = 0;

  function loop() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    var now = Date.now();

    // Spawn new balls
    if (now - lastSpawn > SPAWN_RATE && balls.length < MAX_BALLS) {
      var emitter = getEmitterPos();
      var ex = emitter.x + (Math.random() - 0.5) * 20;
      var ey = emitter.y + (Math.random() - 0.5) * 15;
      balls.push(new Ball(ex, ey));
      lastSpawn = now;
    }

    // Update and draw balls
    var alive = [];
    for (var i = 0; i < balls.length; i++) {
      if (balls[i].update()) {
        balls[i].draw(ctx);
        alive.push(balls[i]);
      }
    }
    balls = alive;

    // Update and draw splash particles
    var aliveSplashes = [];
    for (var s = 0; s < splashes.length; s++) {
      if (splashes[s].update()) {
        splashes[s].draw(ctx);
        aliveSplashes.push(splashes[s]);
      }
    }
    splashes = aliveSplashes;

    raf = requestAnimationFrame(loop);
  }

  function initParticles() {
    canvas = document.getElementById("particle-canvas");
    if (!canvas) return;

    ctx = canvas.getContext("2d");
    balls = [];

    resize();
    window.addEventListener("resize", resize);

    // Start with a few balls already in flight for immediate visual
    var startEmitter = getEmitterPos();
    var ex = startEmitter.x;
    var ey = startEmitter.y;
    for (var i = 0; i < 3; i++) {
      var b = new Ball(
        ex + (Math.random() - 0.5) * 30,
        ey + Math.random() * 100
      );
      b.vy = Math.random() * 3 + 1;
      b.vx = (Math.random() - 0.3) * 4;
      b.born = Date.now() - Math.random() * 3000;
      balls.push(b);
    }

    lastSpawn = Date.now();
    loop();
  }

  // Pause when hero not visible
  var heroObserver;
  function setupVisibilityPause() {
    var hero = document.querySelector(".hero");
    if (!hero || !("IntersectionObserver" in window)) return;

    heroObserver = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        if (!raf) loop();
      } else {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = null;
        }
      }
    }, { threshold: 0.05 });

    heroObserver.observe(hero);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initParticles();
      setupVisibilityPause();
    });
  } else {
    initParticles();
    setupVisibilityPause();
  }
})();
