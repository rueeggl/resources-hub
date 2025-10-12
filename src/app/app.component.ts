import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ResourcesComponent } from './resources/resources.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ResourcesComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'resource-hub';
}
