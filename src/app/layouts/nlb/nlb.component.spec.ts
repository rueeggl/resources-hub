import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NlbComponent } from './nlb.component';

describe('NlbComponent', () => {
  let component: NlbComponent;
  let fixture: ComponentFixture<NlbComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NlbComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NlbComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
