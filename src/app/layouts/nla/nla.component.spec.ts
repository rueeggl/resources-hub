import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NlaComponent } from './nla.component';

describe('NlaComponent', () => {
  let component: NlaComponent;
  let fixture: ComponentFixture<NlaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NlaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NlaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
