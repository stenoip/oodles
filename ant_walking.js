

/**
  Initiates the ant walking animation across the bottom of the screen once.
 */
var startAntWalk = function() {
    // Check if the ant element exists before proceeding
    var ant = document.getElementById('ant-walker');
    if (!ant) {
        return;
    }

    ant.style.display = 'block';
    
    var screenWidth = window.innerWidth;
    var antWidth = 60; // Must match CSS width (for starting/ending position)

    // Set up the CSS transition for the walk (20 seconds duration)
    ant.style.transition = 'transform 20s linear';

    // Schedule the walk after a short delay to ensure initial position is set
    setTimeout(function() {
        // Move the ant from left (off-screen) to right (off-screen)
        ant.style.transform = 'translateX(' + (screenWidth + antWidth) + 'px)';
    }, 100);

    // Hide the ant after the walk is complete (20 seconds + buffer)
    setTimeout(function() {
        ant.style.display = 'none';
    }, 21000);
};

// Start the walk immediately after the script loads
startAntWalk();
