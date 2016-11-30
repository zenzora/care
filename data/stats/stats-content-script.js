self.port.on('populateStatsTable', function(data) {
    for (var i = 0; i < data.length; i++) {
        document.getElementById('table_body').innerHTML += "<tr>" +
            "<td>" + data[i].name + "</td>" +
            "<td>" + data[i].fingerprint + "</td>" +
            "<td>" + data[i].times_seen + "</td>" +
            "</tr>";
    }
});