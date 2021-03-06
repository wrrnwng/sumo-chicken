syncTimer = 0;
var syncRate = 1;
var stopping = null;

var update = function(){

  if (player) {
    var score = game.add.bitmapText(-100,
                                  - game.camera.height / 2 + 30,
                                  'carrier_command',
                                  'SCORE:'+player.score+'\n\nLEVEL:'+player.level, 30);


    score.fixedToCamera = true;
    score.cameraOffset.setTo(game.camera.width / 2 - 115, 10);

    score.lifespan = 1;
    
    var timer = game.add.bitmapText(0, 0, 'carrier_command', '' + player.timer, 50);

    timer.fixedToCamera = true;
    timer.cameraOffset.setTo(game.camera.width / 2 - timer.width / 2, score.height + 40);

    timer.lifespan = 1;
  }


  syncTimer++;
  // Game updates every 2 frames with last update data received
  if (!game.paused && syncTimer % syncRate === 0 && lastData) {

    var syncKeys = Object.keys(lastData.chickens);
    scoreList = [];
    syncKeys.forEach(function(chicken) {
      scoreList.push([lastData.chickens[chicken].username, lastData.chickens[chicken].score]);
      if (chicken !== socket.id) {
        // console.log(lastData.chickens[chicken]);
        if (otherChickens[chicken]) {
          syncExistingChicken(otherChickens[chicken], lastData.chickens[chicken]);
          
        } else {
          addNewChicken(chicken, lastData.chickens[chicken]);
        }
      } else {
        player.score = lastData.chickens[chicken].score;
        if (player.level !== lastData.chickens[chicken].kills) {
          player.level = lastData.chickens[chicken].kills;
          upgradeChicken(player, player.level);
        }
      }
    });
    for (var chicken in otherChickens) {
      if (syncKeys.indexOf(chicken) === -1) {
        otherChickens[chicken].body.moves = true;
        delete otherChickens[chicken];
      }
    }
    // sort the score list by score in descending order; each element is in the form [username, score]
    scoreList.sort(function (a, b) {
      return b[1] - a[1];
    });

    if (!lastData.gameActive) {
      var gameover = game.add.bitmapText(
        -250,
        -200,
        'carrier_command',
        'GAME OVER',
        50
      );

      gameover.align = 'center';
      if (lastData.winner) {
        gameover.text += '\nWINNER: ' + lastData.chickens[lastData.winner].username;
      }

      gameover.fixedToCamera = true;
      gameover.cameraOffset.setTo(game.camera.width / 2 - gameover.width / 2, game.camera.height / 2 - 100);

      gameover.lifespan = 250;
    }

    player.timer = lastData.timer;

    lastData = null;

    socket.emit('sync', {'PX': player.x,
                         'PY': player.y,
                         'VX': player.body.velocity.x,
                         'VY': player.body.velocity.y,
                         'dashBool': dashButton.isDown
                        });

  }
  displayScoreBoard(scoreList);

  game.physics.arcade.collide(player, platforms);

  // Remove hearts that overlap with existing platforms
  game.physics.arcade.overlap(hearts, platforms, function(heart, platform){
    heart.kill();
  });

  // heart 1 line  // Ensure that players cannot go through the platforms if other players jump on them
  game.physics.arcade.overlap(player, platforms, function(playerSprite, platform) {
    var abovePlatform = platform.top - (playerSprite.height/2) - 5; // 5 is to offset player.js line 18
    playerSprite.y = abovePlatform;
  });

  //On overlap, have hearts disappear
  game.physics.arcade.overlap(player, hearts, collectHeart , null, this);


  for (var key in otherChickens) {
    if (!otherChickens[key].paused) {
      game.physics.arcade.collide(otherChickens[key], player, collideChickens);
      game.physics.arcade.collide(otherChickens[key], platforms);
      addAnimations(otherChickens[key]);
    }
  }


  if(cursors.left.isDown) {
    player.moveLeft();

  } else if (cursors.right.isDown) {
    player.moveRight();

  } else {
    player.decelerate();
  }

  if (player.body.touching.down) {
    if (player.body.velocity.x !== 0) {
      if (!dashButton.isDown)
        player.animations.play('walking');
    } else {
      player.frame = 0;
    }

    // Change animation speed
    // player.animations.currentAnim.delay = Math.min(1 / (Math.abs(player.body.velocity.x) * 0.00009), 100);
    // player.animations.currentAnim.delay = Math.floor(Math.min(1 / (Math.abs(player.body.velocity.x) * 0.00009), 100) / 10) * 10;
  }

  // Jump if on ground and move upward until jump runs out or lets go of space
  if(jumpButton.isDown && player.body.touching.down) {
    player.jump();
  } else if (!jumpButton.isDown && !player.body.touching.down) {
    player.stopJump();
  }

  // Increase stored dashMeter
  player.chargeDash();  

  // chicken falls below lava
  if (player.y > 365) {
    music.stop();
    explosion.play();
  }

};



var collectHeart =  function (player, heart) {
    // Removes the star from the screen
    console.log("heart killed, heart id: "+heart.id);
    heart.kill();
    socket.emit('heartKill', {heart: heart.id});

};

var collideChickens = function(otherChicken, thisChicken) {
  audioSprite.play('bump');

  // bump fireball effect
  var fireball = makeFireball(Math.min(otherChicken.x, thisChicken.x) - 16, (otherChicken.y + thisChicken.y - 64) / 2);
  fireball.animations.play('explode', 30, false);

  if (!otherChicken.paused) {
    thisChicken.lastCollidedWith = otherChicken.socketId;
    var right;
    var left;
    if (otherChicken.x > thisChicken.x) {
      right = otherChicken;
      left = thisChicken;
    } else {
      right = thisChicken;
      left = otherChicken;
    }

    var diff = otherChicken.body.velocity.x + thisChicken.body.velocity.x;
    if (diff > 0) {
      // left.body.velocity.x = 0;
      right.body.velocity.x = right.body.velocity.x + left.body.velocity.x;
      stopping = left;
    } else {
      // right.body.velocity.x = 0;
      left.body.velocity.x = left.body.velocity.x + right.body.velocity.x;
      stopping = right;
    }
    stopping.body.velocity.x = 0;
  }
};

var addAnimations = function(chicken) {
  var mathSign = chicken.body.velocity.x === 0 ? 0 : chicken.body.velocity.x > 0 ? 1 : -1;
  if (mathSign !== 0) {
    chicken.scale.x = mathSign > 0 ? -Math.abs(chicken.scale.x) : Math.abs(chicken.scale.x);
    if (chicken.children.length > 0) chicken.children[0].scale.x = mathSign > 0 ? -1 : 1;
  }
  if (chicken.body.velocity.y !== 0) {
    chicken.animations.stop();
    chicken.frame = 24;
  } else if (chicken.body.velocity.x !== 0) {
    chicken.animations.play(chicken.dashing ? 'flying' : 'walking');
  } else {
    chicken.frame = 0;
  }
};

var sendSync = function() {
  socket.emit('sync', {'PX': player.x,
                       'PY': player.y,
                       'VX': player.body.velocity.x,
                       'VY': player.body.velocity.y,
                       'dashBool': dashButton.isDown
                      }
             );
};

var displayScoreBoard = function(data) {
  var scoreboard = game.add.bitmapText(
    0,
    0,
    'carrier_command',
    ' --------- \n|  TOP 5  |\n|---------|',
    24
  );

  var fillSpaces = function(string){
    if(string.length<5){
      while(string.length<5){
        string = string + ' ';
      }
    }
    return string;
  };

  for (var i = 0; i < Math.min(data.length, 5); i++) {
    scoreboard.text += '\n|' + fillSpaces(data[i][0].substring(0,5)) + (data[i][1] > 9 ? ':' : ': ') + data[i][1] + ' |';
  }
  scoreboard.text += '\n--------- ';

  scoreboard.align = 'right';
  scoreboard.fixedToCamera = true;
  scoreboard.cameraOffset.setTo(game.camera.width - ( scoreboard.width + 30 ), 10);
  scoreboard.lifespan = 1;
};

var makeFireball = function(x, y) {
  var fireball = game.add.sprite(x, y, 'fireball');
  var explode = fireball.animations.add('explode');

  setTimeout(function() {
    fireball.kill();
  }, 1000);
  return fireball;
};
