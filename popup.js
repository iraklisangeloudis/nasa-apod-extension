document.addEventListener('DOMContentLoaded', function () {
    // const apiKey = 'lpvX2YSIMhUOJi5CyVl6OHqpRaL3OkslbiavfRQG'; 
    const apiKey = NASA_API_KEY;
    const apodUrl = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}`;
    const cacheDuration = 5 * 60 * 1000; // 5 mins in milliseconds
  
    // Function to display APOD data
  function displayAPODData(data) {
    const apodImage = document.getElementById('apod-image');
    apodImage.src = data.url;

    apodImage.setAttribute('title', 'Click to view in HD');
    apodImage.style.cursor = 'pointer';
    apodImage.addEventListener('click', () => {
    window.open(data.hdurl, '_blank');
    });

    document.getElementById('apod-title').innerText = data.title;
    document.getElementById('apod-date').innerText = data.date;
    document.getElementById('apod-description').innerText = data.explanation;

    const copyrightInfo = data.copyright ? `© ${data.copyright}` : 'Public Domain';
    document.getElementById('apod-copyright').innerText = copyrightInfo;
  }

  // Check if cached data exists and is still valid
  chrome.storage.local.get(['apodData', 'timestamp'], function (result) {
    const now = new Date().getTime();

    if (result.apodData && result.timestamp && (now - result.timestamp) < cacheDuration) {
      // Use cached data if it's not expired
      console.log('Using cached data');
      displayAPODData(result.apodData);
    } else {
      // Make an API call if no valid cached data exists
      const apodUrl = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}`;

      fetch(apodUrl)
        .then(response => response.json())
        .then(data => {
          // Display the data
          displayAPODData(data);

          // Cache the data and store the timestamp
          chrome.storage.local.set({
            apodData: data,
            timestamp: new Date().getTime()  // Store the current time
          }, function () {
            console.log('APOD data has been cached');
          });
        })
        .catch(error => {
          console.error('Error fetching APOD data:', error);
          document.getElementById('apod-content').innerText = 'Failed to load data. Please try again later.';
        });
    }
  });
});
  