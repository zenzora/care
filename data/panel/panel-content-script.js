self.port.on('changeInfo', function(data) {
    document.getElementById("name").innerHTML = data.name;
    document.getElementById("times_seen").innerHTML = data.times_seen;
});