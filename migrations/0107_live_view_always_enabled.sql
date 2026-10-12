-- Die Live-Ansicht ist fester Bestandteil jedes Turniers, auch für bestehende Datensätze.
UPDATE tournaments SET live_view_enabled = 1 WHERE live_view_enabled = 0;
