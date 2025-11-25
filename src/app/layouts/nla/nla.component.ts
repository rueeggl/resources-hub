// nla.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { PDFDocument } from 'pdf-lib';

interface CalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
}

@Component({
  selector: 'app-nla',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nla.component.html',
  styleUrl: './nla.component.scss'
})
export class NlaComponent implements OnInit {
  private readonly LOCAL_STORAGE_KEY = 'nla-ical-url';
  private readonly LR_FEEDBACK_URL = 'https://de.surveymonkey.com/r/Feedback_LR_25_26';

  icalUrl: string = '';
  events: CalendarEvent[] = [];
  loading: boolean = false;
  errorMessage: string = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    const storedUrl = localStorage.getItem(this.LOCAL_STORAGE_KEY);
    if (storedUrl) {
      this.icalUrl = storedUrl;
    }
  }

  onIcalUrlChange(value: string) {
    this.icalUrl = value;
    this.persistIcalUrl();
  }

  private persistIcalUrl() {
    if (typeof window === 'undefined') return;
    if (this.icalUrl.trim()) {
      localStorage.setItem(this.LOCAL_STORAGE_KEY, this.icalUrl);
    } else {
      localStorage.removeItem(this.LOCAL_STORAGE_KEY);
    }
  }

  loadCalendar() {
    if (!this.icalUrl.trim()) {
      this.errorMessage = 'Bitte geben Sie eine gültige iCal URL ein';
      return;
    }

    this.persistIcalUrl();

    this.loading = true;
    this.errorMessage = '';
    this.events = [];

    // Use a CORS proxy for fetching iCal data
    const proxyUrl = 'https://api.allorigins.win/raw?url=';
    const url = proxyUrl + encodeURIComponent(this.icalUrl);

    this.http.get(url, { responseType: 'text' }).subscribe({
      next: (data) => {
        const parsedEvents = this.parseICalendar(data);
        const startOfWeek = this.getStartOfWeek(new Date());
        this.events = parsedEvents.filter(
          (event) =>
            event.start.getTime() >= startOfWeek.getTime() &&
            event.summary?.includes('1. SR') &&
            event.summary?.includes('(NLA)')
        );
        this.loading = false;
        if (this.events.length === 0) {
          this.errorMessage = 'Keine Events gefunden';
        }
      },
      error: (error) => {
        console.error('Error loading calendar:', error);
        this.errorMessage = 'Fehler beim Laden des Kalenders. Bitte überprüfen Sie die URL.';
        this.loading = false;
      }
    });
  }

  private parseICalDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // Remove TZID and other parameters
    dateStr = dateStr.split(':').pop() || '';

    // Handle both date and datetime formats
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));

    if (dateStr.length > 8) {
      const hour = parseInt(dateStr.substring(9, 11));
      const minute = parseInt(dateStr.substring(11, 13));
      return new Date(year, month, day, hour, minute);
    }

    return new Date(year, month, day);
  }

  private parseICalendar(icsText: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const lines = icsText.split(/\r?\n/);
    let currentEvent: Partial<CalendarEvent> | null = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Handle line folding (continuation lines start with space or tab)
      while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
        i++;
        line += lines[i].substring(1);
      }

      if (line === 'BEGIN:VEVENT') {
        currentEvent = {};
      } else if (line === 'END:VEVENT' && currentEvent && currentEvent.start && currentEvent.summary) {
        events.push(currentEvent as CalendarEvent);
        currentEvent = null;
      } else if (currentEvent) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex);
          const value = line.substring(colonIndex + 1);

          if (key.startsWith('DTSTART')) {
            const date = this.parseICalDate(value);
            if (date) currentEvent.start = date;
          } else if (key.startsWith('DTEND')) {
            const date = this.parseICalDate(value);
            if (date) currentEvent.end = date;
          } else if (key === 'SUMMARY') {
            currentEvent.summary = this.decodeICalText(value);
          } else if (key === 'DESCRIPTION') {
            currentEvent.description = this.decodeICalText(value);
          } else if (key === 'LOCATION') {
            currentEvent.location = this.decodeICalText(value);
          }
        }
      }
    }

    // Sort events by start date
    return events.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  private decodeICalText(text: string): string {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('de-CH', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  formatTime(date: Date): string {
    return new Intl.DateTimeFormat('de-CH', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  private getStartOfWeek(date: Date): Date {
    const start = new Date(date);
    const day = start.getDay();
    const diff = (day + 6) % 7; // Monday as start of the week
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  getLrFeedbackLink(event: CalendarEvent): string {
    const params = new URLSearchParams({
      eventSummary: event.summary ?? '',
      eventDate: this.formatDate(event.start)
    });

    if (event.description) {
      params.set('eventDescription', event.description);
    }

    return `${this.LR_FEEDBACK_URL}?${params.toString()}`;
  }

  async fillPdfForEvent(event: CalendarEvent) {
    try {
      // Load the PDF template
      const pdfUrl = 'assets/downloads/d_NLA_Rapport_Sporthalle_und_Spielorganisation_2025.pdf';
      const existingPdfBytes = await fetch(pdfUrl).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(existingPdfBytes);

      // Try to get the form (if AcroForm exists)
      let form;
      try {
        form = pdfDoc.getForm();
      } catch (e) {
        alert('Das PDF hat keine ausfüllbaren Felder.');
        return;
      }

      // Map event data to PDF fields (update field names as needed)
      this.fillPdfFields(form, event);

      // Save and trigger download
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rapport_${event.summary}_${this.formatDate(event.start)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Fehler beim Ausfüllen des PDFs: ' + err);
    }
  }

  private fillPdfFields(form: any, event: CalendarEvent) {
    // Parse event description to extract structured data
    const parsedData = this.parseEventDescription(event.description || '');
    try {
      // Fill SpielNr field with game number
      if (parsedData.gameNumber) {
        try {
          form.getTextField('SpielNr').setText(parsedData.gameNumber);
        } catch (e) {
          console.log('SpielNr field not found');
        }
      }

      // Fill Heimteam (home team)
      if (parsedData.homeTeam) {
        try {
          form.getTextField('Heimteam').setText(parsedData.homeTeam);
        } catch (e) {
          console.log('Heimteam field not found');
        }
      }

      // Fill Gastteam (away team)
      if (parsedData.awayTeam) {
        try {
          form.getTextField('Gastteam').setText(parsedData.awayTeam);
        } catch (e) {
          console.log('Gastteam field not found');
        }
      }

      // Fill Hallenname (venue name)
      if (parsedData.venueName) {
        try {
          form.getTextField('Hallenname').setText(parsedData.venueName);
        } catch (e) {
          console.log('Hallenname field not found');
        }
      }

      // Fill Ort (city with postal code)
      if (parsedData.city) {
        try {
          form.getTextField('Ort').setText(parsedData.city);
        } catch (e) {
          console.log('Ort field not found');
        }
      }

      // Fill Datum (date in DD.MM.YYYY format)
      if (parsedData.gameDate) {
        try {
          form.getTextField('Datum').setText(parsedData.gameDate);
        } catch (e) {
          console.log('Datum field not found');
        }
      }

      // Fill Text19 (1. SR name)
      if (parsedData.firstReferee) {
        try {
          form.getTextField('Text19').setText(parsedData.firstReferee);
        } catch (e) {
          console.log('Text19 field not found');
        }
      }

      // Fill Text20 (2. SR name)
      if (parsedData.secondReferee) {
        try {
          form.getTextField('Text20').setText(parsedData.secondReferee);
        } catch (e) {
          console.log('Text20 field not found');
        }
      }

      // Check radio button for gender
      if (parsedData.league) {
        try {
          const radioGroup = form.getRadioGroup('Gruppe3');
          const options = radioGroup.getOptions();

          if (options.length > 0) {
            if (parsedData.league.includes('♂')) {
              // Male - select first option
              radioGroup.select(options[0]);
            } else if (parsedData.league.includes('♀')) {
              // Female - select second option
              if (options.length > 1) {
                radioGroup.select(options[1]);
              }
            }
          }
        } catch (e) {
          console.log('Gruppe3 radio group not found or could not select:', e);
        }
      }

    } catch (e) {
      console.error('Error filling PDF fields:', e);
    }
  }

  private parseEventDescription(description: string): {
    gameNumber?: string;
    homeTeam?: string;
    awayTeam?: string;
    league?: string;
    venueName?: string;
    venueAddress?: string;
    city?: string;
    gameDate?: string;
    firstReferee?: string;
    secondReferee?: string;
  } {
    const data: any = {};

    // Extract game number (e.g., #377790)
    const gameMatch = description.match(/Spiel: #(\d+)/);
    if (gameMatch) {
      data.gameNumber = gameMatch[1];
    }

    // Extract game date (e.g., "29.11.2025 18:00" from "Spiel: #377790 | 29.11.2025 18:00 | ...")
    const dateMatch = description.match(/Spiel: #\d+ \| (\d{2}\.\d{2}\.\d{4})/);
    if (dateMatch) {
      data.gameDate = dateMatch[1];
    }

    // Extract teams (e.g., Lausanne UC — Volley Amriswil)
    const teamsMatch = description.match(/Spiel: #\d+ \| .+ \| (.+) — (.+)/);
    if (teamsMatch) {
      data.homeTeam = teamsMatch[1].trim();
      data.awayTeam = teamsMatch[2].trim();
    }

    // Extract league (e.g., "NLA | ♂" from "Liga: #6607 | NLA | ♂")
    const leagueMatch = description.match(/Liga: #\d+ \| ([^\n]+)/);
    if (leagueMatch) {
      // Extract both league name and gender symbol
      const leagueInfo = leagueMatch[1].trim();
      // Remove extra pipes and spaces, combine league and gender (e.g., "NLA | ♂" -> "NLA ♂")
      data.league = leagueInfo.replace(/\s*\|\s*/g, ' ').trim();
    }

    // Extract venue name (e.g., "Centre Sportif Unil SOS II Dorigny 1-3" from "Halle: #82 | Centre Sportif Unil SOS II Dorigny 1-3 (A)")
    const venueMatch = description.match(/Halle: #\d+ \| ([^\n(]+)/);
    if (venueMatch) {
      data.venueName = venueMatch[1].trim();
    }

    // Extract venue address and parse city
    const addressMatch = description.match(/Adresse: ([^\n]+)/);
    if (addressMatch) {
      data.venueAddress = addressMatch[1].trim();

      // Extract postal code + city (e.g., "1015 Lausanne" from "Route Cantonale 11, 1015 Lausanne")
      const cityMatch = addressMatch[1].match(/(\d{4}\s+[^,]+)/);
      if (cityMatch) {
        data.city = cityMatch[1].trim();
      }
    }

    // Extract 1. SR name (e.g., "Laura Rüegg" from "1. SR: Laura Rüegg | laura.rueegg@me.com | +41796558486")
    const firstRefMatch = description.match(/1\. SR: ([^|]+)/);
    if (firstRefMatch) {
      data.firstReferee = firstRefMatch[1].trim();
    }

    // Extract 2. SR name (e.g., "Thierry Mordasini" from "2. SR: Thierry Mordasini | thierryvolley@hotmail.ch | +41794433107")
    const secondRefMatch = description.match(/2\. SR: ([^|]+)/);
    if (secondRefMatch) {
      data.secondReferee = secondRefMatch[1].trim();
    }

    return data;
  }
}
