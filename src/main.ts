import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Route, withHashLocation } from '@angular/router';
import { importProvidersFrom } from '@angular/core';
import { AppComponent } from './app/app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HomeComponent } from './app/home/home/home.component';
import { NlbComponent } from './app/layouts/nlb/nlb.component';
import { NlaComponent } from './app/layouts/nla/nla.component';
import { GeneralComponent } from './app/layouts/general/general.component';

const routes: Route[] = [
  { path: '', redirectTo: '/nla', pathMatch: 'full' },
  {
    path: '',
    component: HomeComponent,
    children: [
      { path: 'nla', component: NlaComponent },
      { path: 'nlb', component: NlbComponent },
      { path: 'general', component: GeneralComponent },
    ],
  },
  { path: '**', redirectTo: '/nla' },
];

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withHashLocation()),
    importProvidersFrom(BrowserAnimationsModule)
  ]
}).catch(err => console.error(err));
