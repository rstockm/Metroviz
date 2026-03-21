# MetroViz

MetroViz ist ein leichtgewichtiges Framework zur Visualisierung strategischer Technologieentscheidungen. Es stellt Projekt-Roadmaps und Software-Lebenszyklen visuell im Stil eines klassischen U-Bahn-Netzplans (Metro-Map) dar.

## Features

* **Interaktive Metro-Map**: Visualisierung von Technologiebereichen (Zonen) und darin verlaufenden Software-Lebenszyklen (Linien).
* **Visueller Editor**: Ein integrierter, formularbasierter Editor ermöglicht die schnelle und einfache Eingabe von Daten direkt im Browser. Änderungen spiegeln sich in Echtzeit in der Karte wider.
* **JSON-Modus**: Für Power-User gibt es einen Split-Screen-Modus, in dem die Rohdaten (JSON) direkt editiert und validiert werden können.
* **Klassische Ansicht (Textfassung)**: Automatische Generierung einer strukturierten, klassischen Projektansicht im Markdown-Format, ideal für Lastenhefte oder klassisches Projektmanagement.
* **Haltestellen & Meilensteine**: Detaillierte Planung durch verschiedene Stationstypen:
  * Start & Ende (Terminus)
  * Meilensteine (runde Knotenpunkte)
  * Haltestellen (kleinere, unauffälligere Zwischenschritte ohne aufdringliche Labels)
  * Transferstationen (sichtbare Übergänge bzw. Migrationen von einer Technologie zur nächsten)
* **Intelligentes Routing**: Linien weichen einander automatisch aus, Labels platzieren sich per Kollisionserkennung dynamisch so, dass sie sich nicht überlappen, und Transfer-Linien biegen sich physikalisch korrekt zueinander.
* **Lokale Persistenz**: Alle Änderungen, neue Roadmaps oder Kopien werden automatisch und lokal im `localStorage` des Browsers gesichert. Es ist keine Datenbankanbindung notwendig.
* **URL-State-Management**: Ansichten (Editor, Map, Textfassung) und die geladene Datei sind über die URL teil- und speicherbar (z.B. für Lesezeichen).
* **Teilen per Link (`?data=`)**: Über „Teilen“ wird die aktuelle Roadmap als mit LZ-String komprimierter Parameter in die URL gelegt; der Link lässt sich kopieren und öffnet dieselben Daten ohne Backend (nach dem ersten Laden werden `data`/`source` aus der Adresszeile entfernt, um kurze URLs zu behalten).
* **Remote-Laden (`?source=`)**: Eine Roadmap kann per `?source=<URL-zu-einer-.json-Datei>` von einem beliebigen Host geladen werden, sofern CORS den Abruf erlaubt (bei Fehlern erscheint eine Meldung im Editor).
* **Export-Funktionen**:
  * **SVG-Export**: Die generierte Metro-Map lässt sich verlustfrei als Vektorgrafik herunterladen.
  * **JSON-Export**: Die Rohdaten können zur Sicherung oder Weitergabe exportiert werden.
  * **Markdown-Export**: Die generierte Textfassung lässt sich als `.md`-Datei herunterladen.
* **Dark Mode Editor**: Elegantes, modernes Editor-Design in dunklen Farben, getrennt von der übersichtlichen, hellen Karte.
* **Markdown-Beschreibungen**: Zu jeder Station können ausführliche Beschreibungen im Markdown-Format hinterlegt werden, die bei Hover (im Tooltip) und im Text-Export gerendert angezeigt werden.
* **Automatische Zeitberechnung**: Tooltips zeigen automatisch die Dauer in Wochen bis zum nächsten Meilenstein an.

## Technologie-Stack

MetroViz ist als 100% statische, clientseitige Web-App konzipiert ("Serverless"). Sie benötigt kein Backend und kann auf jedem beliebigen Standard-Webserver (z. B. GitHub Pages, Apache, Nginx) oder lokal gehostet werden.

### Frontend
* **Vanilla HTML5, CSS3, JavaScript (ES6 Modules)**: Die Basis der Anwendung, aufgeteilt in logische Module (`app.js`, `data-model.js`, `layout-engine.js`, `metro-renderer.js`).
* **D3.js (v7)**: Die Kern-Bibliothek für das Rendering. D3.js übernimmt die Berechnung der Zeitskalen (`d3.scaleTime`), das Zeichnen der SVG-Pfade, Kreise und Kurven sowie die interaktiven Zoom- und Pan-Funktionen.
* **Alpine.js (v3)**: Ein leichtgewichtiges, reaktives UI-Framework. Es kümmert sich um das Two-Way-Data-Binding zwischen dem JSON-State und dem visuellen Editor (Formulare, Buttons, Collapsibles) und steuert die Sichtbarkeiten im DOM (x-show, x-model, x-for).
* **Marked.js**: Ein schneller Markdown-Parser, der genutzt wird, um die Beschreibungsfelder der Stationen in sauberes HTML für die Tooltips und die Textfassung zu übersetzen.
* **CSS-Grid & Flexbox**: Für das responsive Split-Screen-Layout und die Anordnung der Editor-Elemente. CSS-Variablen steuern das Theming.

### Datenhaltung
* **JSON**: Das zentrale Datenformat für die Definition der Roadmaps.
* **localStorage API**: Wird für die clientseitige Persistenz der verschiedenen Dateien genutzt.

### URL-Parameter (dezentrales Laden)

Priorität beim Start: `data` (komprimierter Inhalt) vor `source` (Remote-URL) vor `file` (gespeicherte lokale Datei) vor zuletzt genutzter bzw. Beispiel-Roadmap.

| Parameter | Beschreibung |
|-----------|--------------|
| `data` | LZ-String-komprimierter JSON-Text (URL-kodiert), wie vom Teilen-Button erzeugt. |
| `source` | Vollständige HTTPS-URL einer `.json`-Datei; der Server muss passende CORS-Header senden. |
| `editor`, `view`, `file` | Wie bisher: Editor sichtbar, Ansicht (map/markdown), gewählte lokale Datei aus dem Index. |

## Lokale Ausführung

Klonen Sie das Repository und starten Sie einen lokalen Webserver, z.B. mit Python:

```bash
git clone https://github.com/rstockm/Metroviz.git
cd Metroviz
python3 -m http.server 8000
```

Anschließend können Sie die App unter `http://localhost:8000` in Ihrem Browser aufrufen.