self.port.on('changeInfo', function(data) {
    document.getElementById("name").innerHTML = data.name;
    document.getElementById("times_seen").innerHTML = data.times_seen;
});
document.getElementById("openStatsLink").addEventListener('click', function(event) {
    self.port.emit("openStatsPage");
});