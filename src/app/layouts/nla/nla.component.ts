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

    // Try fetching with multiple CORS proxies as fallback
    this.fetchWithFallback(this.icalUrl);
  }

  private fetchWithFallback(url: string, proxyIndex: number = 0) {
    const corsProxies = [
      'https://corsproxy.io/?',
      'https://api.allorigins.win/raw?url=',
      'https://api.codetabs.com/v1/proxy?quest='
    ];

    if (proxyIndex >= corsProxies.length) {
      this.errorMessage = 'Fehler beim Laden des Kalenders. Alle Proxy-Server sind nicht erreichbar.';
      this.loading = false;
      return;
    }

    const proxyUrl = corsProxies[proxyIndex] + encodeURIComponent(url);

    this.http.get(proxyUrl, { responseType: 'text' }).subscribe({
      next: (data) => {
        const parsedEvents = this.parseICalendar(data);

        const today = new Date();
        const currentDay = today.getDay();
        const daysToMonday = (currentDay + 6) % 7;
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - daysToMonday - 7);
        lastWeekStart.setHours(0, 0, 0, 0);

        this.events = parsedEvents.filter(
          (event) => {
            const isAfterCutoff = event.start.getTime() >= lastWeekStart.getTime();
            const isFirstReferee = event.summary?.includes('ARB 1') || event.summary?.includes('1. SR');

            if (!isAfterCutoff || !isFirstReferee) {
              return false;
            }

            const summaryText = (event.summary || '') + ' ' + (event.description || '');
            const hasMobiliar = summaryText.includes('Mobiliar');
            const hasNLA = summaryText.includes('(NLA)') || summaryText.includes('(LNA)');

            return hasMobiliar || hasNLA;
          }
        );

        this.loading = false;
        if (this.events.length === 0) {
          this.errorMessage = 'Keine Events gefunden';
        }
      },
      error: (_error) => {
        this.fetchWithFallback(url, proxyIndex + 1);
      }
    });
  }

  private parseICalDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    const isUTC = dateStr.includes('TZID=UTC');

    // Extract the date value (after the last colon)
    const colonIndex = dateStr.lastIndexOf(':');
    if (colonIndex === -1) return null;

    const dateValue = dateStr.substring(colonIndex + 1);

    const year = parseInt(dateValue.substring(0, 4));
    const month = parseInt(dateValue.substring(4, 6)) - 1;
    const day = parseInt(dateValue.substring(6, 8));

    if (dateValue.length > 8) {
      const hour = parseInt(dateValue.substring(9, 11));
      const minute = parseInt(dateValue.substring(11, 13));

      let resultDate;
      if (isUTC) {
        resultDate = new Date(Date.UTC(year, month, day, hour, minute));
      } else {
        resultDate = new Date(year, month, day, hour, minute);
      }
      return resultDate;
    }

    return new Date(year, month, day);
  }

  private parseICalendar(icsText: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const lines = icsText.split(/\r?\n/);
    let currentEvent: Partial<CalendarEvent> | null = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

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
            const date = this.parseICalDate(line);
            if (date) currentEvent.start = date;
          } else if (key.startsWith('DTEND')) {
            const date = this.parseICalDate(line);
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
    const formatted = new Intl.DateTimeFormat('de-CH', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
    return formatted;
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
    const parsedData = this.parseEventDescription(event.description || '');
    try {
      if (parsedData.gameNumber) {
        try {
          form.getTextField('SpielNr').setText(parsedData.gameNumber);
        } catch (e) {
        }
      }

      if (parsedData.homeTeam) {
        try {
          form.getTextField('Heimteam').setText(parsedData.homeTeam);
        } catch (e) {
        }
      }

      if (parsedData.awayTeam) {
        try {
          form.getTextField('Gastteam').setText(parsedData.awayTeam);
        } catch (e) {
        }
      }

      if (parsedData.venueName) {
        try {
          form.getTextField('Hallenname').setText(parsedData.venueName);
        } catch (e) {
        }
      }

      if (parsedData.city) {
        try {
          form.getTextField('Ort').setText(parsedData.city);
        } catch (e) {
        }
      }

      if (parsedData.gameDate) {
        try {
          form.getTextField('Datum').setText(parsedData.gameDate);
        } catch (e) {
        }
      }

      if (parsedData.firstReferee) {
        try {
          form.getTextField('Text19').setText(parsedData.firstReferee);
        } catch (e) {
        }
      }

      if (parsedData.secondReferee) {
        try {
          form.getTextField('Text20').setText(parsedData.secondReferee);
        } catch (e) {
        }
      }

      if (parsedData.league) {
        try {
          const radioGroup = form.getRadioGroup('Gruppe3');
          const options = radioGroup.getOptions();

          if (options.length > 0) {
            if (parsedData.league.includes('♂')) {
              radioGroup.select(options[0]);
            } else if (parsedData.league.includes('♀')) {
              if (options.length > 1) {
                radioGroup.select(options[1]);
              }
            }
          }
        } catch (e) {
        }
      }

    } catch (e) {
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

    let gameMatch = description.match(/Spiel: #(\d+)/);
    if (!gameMatch) {
      gameMatch = description.match(/Match: #(\d+)/);
    }
    if (gameMatch) {
      data.gameNumber = gameMatch[1];
    }

    let dateMatch = description.match(/Spiel: #\d+ \| (\d{2}\.\d{2}\.\d{4})/);
    if (!dateMatch) {
      dateMatch = description.match(/Match: #\d+ \| (\d{2}\.\d{2}\.\d{4})/);
    }
    if (dateMatch) {
      data.gameDate = dateMatch[1];
    }

    let teamsMatch = description.match(/Spiel: #\d+ \| .+ \| (.+) — (.+)/);
    if (!teamsMatch) {
      teamsMatch = description.match(/Match: #\d+ \| .+ \| (.+) — (.+)/);
    }
    if (teamsMatch) {
      data.homeTeam = teamsMatch[1].trim();
      data.awayTeam = teamsMatch[2].trim();
    }

    let leagueMatch = description.match(/Liga: #\d+ \| ([^\n]+)/);
    if (!leagueMatch) {
      leagueMatch = description.match(/Ligue: #\d+ \| ([^\n]+)/);
    }
    if (leagueMatch) {
      const leagueInfo = leagueMatch[1].trim();
      data.league = leagueInfo.replace(/\s*\|\s*/g, ' ').trim();
    }

    let venueMatch = description.match(/Halle: #\d+ \| ([^\n(]+)/);
    if (!venueMatch) {
      venueMatch = description.match(/Salle: #\d+ \| ([^\n(]+)/);
    }
    if (venueMatch) {
      data.venueName = venueMatch[1].trim();
    }

    const addressMatch = description.match(/Adresse: ([^\n]+)/);
    if (addressMatch) {
      data.venueAddress = addressMatch[1].trim();
      const cityMatch = addressMatch[1].match(/(\d{4}\s+[^,]+)/);
      if (cityMatch) {
        data.city = cityMatch[1].trim();
      }
    }

    let firstRefMatch = description.match(/1\. SR: ([^|]+)/);
    if (!firstRefMatch) {
      firstRefMatch = description.match(/ARB 1: ([^|]+)/);
    }
    if (firstRefMatch) {
      data.firstReferee = firstRefMatch[1].trim();
    }

    let secondRefMatch = description.match(/2\. SR: ([^|]+)/);
    if (!secondRefMatch) {
      secondRefMatch = description.match(/ARB 2: ([^|]+)/);
    }
    if (secondRefMatch) {
      data.secondReferee = secondRefMatch[1].trim();
    }

    return data;
  }
}
