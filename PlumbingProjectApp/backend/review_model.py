from fireo.models import Model
from fireo.fields import TextField, IDField, NumberField, BooleanField, DateTime, ListField
from datetime import datetime

class Review(Model):

    id = IDField()
    
    date_received = DateTime()  # When review was submitted
    date_processed = DateTime()  # When admin approved/rejected
    
    # Reviewer Info
    last_name = TextField()
    first_name = TextField()
    grade = TextField()
    school = TextField()
    email = TextField()
    phone_number = TextField()
    
    # Book Information
    book_title = TextField()
    author = TextField()
    recommended_audience_grade = ListField()
    
    # Review Content
    rating = NumberField()
    review = TextField()
    anonymous = TextField()
    
    # Admin Processing
    approved = BooleanField(default=False)
    added_to_reviewed_book_list = BooleanField(default=False)
    
    # Volunteer Tracking
    # time_earned = NumberField(default=0.5)
    # total_hours = NumberField(default=0)
    on_volgistics = BooleanField(default=False)
    
    # Library Management
    call_number = TextField()
    qr_code = TextField()
    label_created = BooleanField(default=False)
    label_applied = BooleanField(default=False)
    
    # Administrative
    entry_id = TextField()
    sent_confirmation_email = BooleanField(default=False)
    form_url = TextField()
    notes_to_admin = TextField()
    comment_to_user = TextField()

    genres = ListField()
    
    class Meta:
        collection_name = 'reviews'


def create_review(data):
    review = Review()
    review.date_received = datetime.now()
    
    for key, value in data.items():
        if hasattr(review, key):
            setattr(review, key, value)
    
    return review.save()


def process_review(review_id, approved, admin_comment=None):
    review = Review.collection.get(review_id)
    review.approved = approved
    review.date_processed = datetime.now()
    
    if admin_comment:
        review.comment_to_user = admin_comment
    
    return review.update()


def calculate_user_hours(email):
    reviews = Review.collection.filter('email', '==', email).filter('approved', '==', True).fetch()
    total_hours = sum(0.5 for r in reviews)
    
    # for review in reviews:
    #     review.total_hours = total_hours
    #     review.update()
    
    return total_hours