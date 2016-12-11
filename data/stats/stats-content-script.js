self.port.on('populateStatsTable', function(data) {
    for (var i = 0; i < data.length; i++) {
        var markChecked = function(value,alert_status){
            if(alert_status == value){
                return 'checked';
            }
            return '';
        };
        document.getElementById('table_body').innerHTML += "<tr>" +
            "<td>" +
            "<input class='alertStatusOption' type='radio' name='"+data[i].fingerprint+"' value='default' "+markChecked('default',data[i].alert_status)+">Default<br>"+
            "<input class='alertStatusOption' type='radio' name='"+data[i].fingerprint+"' value='always' "+markChecked('always',data[i].alert_status)+">Always Alert<br>"+
            "<input class='alertStatusOption' type='radio' name='"+data[i].fingerprint+"' value='never' "+markChecked('never',data[i].alert_status)+"> Never Alert" +
            "</td>" +
            "<td>" + data[i].name + "</td>" +
            "<td><textarea readonly rows='4' cols='50'>" + data[i].fingerprint + "</textarea></td>" +
            "<td>" + data[i].times_seen + "</td>" +
            "</tr>";
        var alertStatusOptions = document.getElementsByClassName('alertStatusOption');
        for (var j = 0; j < alertStatusOptions.length; j++) {
            alertStatusOptions[j].addEventListener('click', function(event) {
                self.port.emit('updateAlertStatus',{"fingerprint":this.name, "value":this.value});
            });
        }
    }
});